-- PitchFlow schema, no-login version. Run the WHOLE file in the Supabase SQL editor.
-- This resets the game tables. Only safe before you post real games.

drop table if exists public.rsvps cascade;
drop table if exists public.games cascade;
drop table if exists public.hosts cascade;
drop table if exists public.admins cascade;
drop table if exists public.app_settings cascade;
drop function if exists public.is_admin();

-- ---------- Tables ----------

create table public.app_settings (
  key text primary key,
  value text not null
);

create table public.hosts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 40),
  pin text not null check (pin ~ '^[0-9]{4,8}$'),
  contact text not null,
  audience_size int not null default 0 check (audience_size >= 0),
  about text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now()
);
create unique index hosts_name_unique on public.hosts (lower(name));

create table public.games (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  host_name text not null,
  title text not null,
  game_type text not null check (game_type in ('Futsal', 'Grass field', '5v5')),
  setting text not null check (setting in ('Indoor', 'Outdoor')),
  location text not null,
  starts_at timestamptz not null,
  max_players int not null default 10 check (max_players between 2 and 50),
  price_per_player numeric(8,2) not null default 0 check (price_per_player >= 0),
  payment_instructions text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_name text not null check (char_length(trim(player_name)) between 2 and 40),
  state text not null check (state in ('joined', 'waitlist')),
  paid_claimed boolean not null default false,
  paid_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index rsvps_one_per_name on public.rsvps (game_id, lower(player_name));

-- ---------- Security ----------
-- Nobody can read or write these tables directly from the website.
-- Everything goes through the functions below, which check the host PIN or admin passcode.

alter table public.app_settings enable row level security;
alter table public.hosts enable row level security;
alter table public.games enable row level security;
alter table public.rsvps enable row level security;

-- Public can see approved games only
create policy "public reads approved games" on public.games
  for select to anon using (status = 'approved');

-- Public can see rsvp names and status for approved games, never ids
create policy "public reads rsvps of approved games" on public.rsvps
  for select to anon using (
    exists (select 1 from public.games g where g.id = game_id and g.status = 'approved')
  );
revoke select on public.rsvps from anon;
grant select (game_id, player_name, state, created_at, paid_claimed, paid_confirmed) on public.rsvps to anon;

-- ---------- Internal admin check ----------

create or replace function public.check_admin(p_pass text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.app_settings where key = 'admin_passcode' and value = p_pass) then
    raise exception 'Wrong admin passcode.';
  end if;
end $$;
revoke execute on function public.check_admin(text) from public, anon;

-- ---------- Host functions (name + PIN) ----------

create or replace function public.host_apply(p_name text, p_pin text, p_contact text, p_audience int, p_about text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(p_name)) < 2 then raise exception 'Please enter your name.'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'Your PIN must be 4 to 8 digits.'; end if;
  if exists (select 1 from public.hosts where lower(name) = lower(trim(p_name))) then
    raise exception 'That name is already taken. Pick another name.';
  end if;
  insert into public.hosts (name, pin, contact, audience_size, about)
  values (trim(p_name), p_pin, trim(p_contact), coalesce(p_audience, 0), p_about);
end $$;

create or replace function public.host_dashboard(p_name text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h public.hosts%rowtype;
begin
  select * into h from public.hosts where lower(name) = lower(trim(p_name)) and pin = p_pin;
  if not found then raise exception 'Name or PIN is incorrect.'; end if;
  return jsonb_build_object(
    'host', jsonb_build_object('id', h.id, 'name', h.name, 'status', h.status),
    'games', coalesce((select jsonb_agg(to_jsonb(g) order by g.starts_at desc) from public.games g where g.host_id = h.id), '[]'::jsonb),
    'rsvps', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.rsvps r
                        join public.games g on g.id = r.game_id where g.host_id = h.id), '[]'::jsonb)
  );
end $$;

create or replace function public.host_create_game(
  p_name text, p_pin text, p_title text, p_type text, p_setting text, p_location text,
  p_starts timestamptz, p_max int, p_price numeric, p_pay text
) returns void language plpgsql security definer set search_path = public as $$
declare h public.hosts%rowtype;
begin
  select * into h from public.hosts where lower(name) = lower(trim(p_name)) and pin = p_pin;
  if not found then raise exception 'Name or PIN is incorrect.'; end if;
  if h.status <> 'approved' then raise exception 'Your host account is not approved yet.'; end if;
  insert into public.games (host_id, host_name, title, game_type, setting, location, starts_at,
                            max_players, price_per_player, payment_instructions)
  values (h.id, h.name, trim(p_title), p_type, p_setting, trim(p_location), p_starts,
          p_max, coalesce(p_price, 0), nullif(trim(coalesce(p_pay, '')), ''));
end $$;

create or replace function public.host_set_paid(p_name text, p_pin text, p_rsvp uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
declare h public.hosts%rowtype;
begin
  select * into h from public.hosts where lower(name) = lower(trim(p_name)) and pin = p_pin;
  if not found then raise exception 'Name or PIN is incorrect.'; end if;
  update public.rsvps r set paid_confirmed = p_value
  from public.games g
  where r.id = p_rsvp and g.id = r.game_id and g.host_id = h.id;
  if not found then raise exception 'That player is not in one of your games.'; end if;
end $$;

-- ---------- Admin functions (passcode) ----------

create or replace function public.admin_overview(p_pass text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public.check_admin(p_pass);
  return jsonb_build_object(
    'hosts', coalesce((select jsonb_agg(to_jsonb(h) - 'pin' order by h.created_at desc) from public.hosts h), '[]'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(g) order by g.starts_at) from public.games g), '[]'::jsonb),
    'rsvps', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at) from public.rsvps r), '[]'::jsonb)
  );
end $$;

create or replace function public.admin_set_host(p_pass text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.check_admin(p_pass);
  update public.hosts set status = p_status where id = p_id;
end $$;

create or replace function public.admin_set_game(p_pass text, p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.check_admin(p_pass);
  update public.games set status = p_status where id = p_id;
end $$;

create or replace function public.admin_set_paid(p_pass text, p_rsvp uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.check_admin(p_pass);
  update public.rsvps set paid_confirmed = p_value where id = p_rsvp;
end $$;

-- ---------- Player functions (no login) ----------

create or replace function public.join_game(p_game uuid, p_name text)
returns table (out_rsvp_id uuid, out_state text)
language plpgsql security definer set search_path = public as $$
declare
  g public.games%rowtype;
  clean text := trim(p_name);
  joined_count int;
  new_state text;
  new_id uuid;
begin
  if char_length(clean) < 2 or char_length(clean) > 40 then
    raise exception 'Please enter a name between 2 and 40 characters.';
  end if;
  select * into g from public.games where id = p_game and status = 'approved' for update;
  if not found then raise exception 'This game is not open for sign-ups.'; end if;
  if g.starts_at <= now() then raise exception 'This game has already started.'; end if;
  if exists (select 1 from public.rsvps r where r.game_id = p_game and lower(r.player_name) = lower(clean)) then
    raise exception 'That name is already signed up for this game.';
  end if;
  select count(*) into joined_count from public.rsvps r where r.game_id = p_game and r.state = 'joined';
  new_state := case when joined_count < g.max_players then 'joined' else 'waitlist' end;
  insert into public.rsvps (game_id, player_name, state) values (p_game, clean, new_state)
  returning id into new_id;
  return query select new_id, new_state;
end $$;

create or replace function public.leave_game(p_rsvp uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.rsvps%rowtype;
  next_id uuid;
begin
  select * into r from public.rsvps where id = p_rsvp;
  if not found or lower(r.player_name) <> lower(trim(p_name)) then
    raise exception 'Could not find your spot in this game.';
  end if;
  delete from public.rsvps where id = r.id;
  if r.state = 'joined' then
    select id into next_id from public.rsvps
      where game_id = r.game_id and state = 'waitlist'
      order by created_at limit 1 for update skip locked;
    if next_id is not null then
      update public.rsvps set state = 'joined' where id = next_id;
    end if;
  end if;
end $$;

create or replace function public.mark_paid(p_rsvp uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.rsvps set paid_claimed = true
  where id = p_rsvp and lower(player_name) = lower(trim(p_name));
  if not found then raise exception 'Could not find your spot in this game.'; end if;
end $$;

-- ---------- Permissions ----------

grant execute on function public.join_game(uuid, text) to anon;
grant execute on function public.leave_game(uuid, text) to anon;
grant execute on function public.mark_paid(uuid, text) to anon;
grant execute on function public.host_apply(text, text, text, int, text) to anon;
grant execute on function public.host_dashboard(text, text) to anon;
grant execute on function public.host_create_game(text, text, text, text, text, text, timestamptz, int, numeric, text) to anon;
grant execute on function public.host_set_paid(text, text, uuid, boolean) to anon;
grant execute on function public.admin_overview(text) to anon;
grant execute on function public.admin_set_host(text, uuid, text) to anon;
grant execute on function public.admin_set_game(text, uuid, text) to anon;
grant execute on function public.admin_set_paid(text, uuid, boolean) to anon;

-- ---------- Set the admin passcode (do this last) ----------
-- Replace PUT-YOUR-PASSCODE-HERE with a passcode only you know, then run this one line:
-- insert into public.app_settings (key, value) values ('admin_passcode', 'PUT-YOUR-PASSCODE-HERE');

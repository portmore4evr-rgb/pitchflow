-- PitchFlow schema. Run this whole file in the Supabase SQL editor.

-- ---------- Tables ----------

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.hosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  contact text not null,
  audience_size int not null default 0 check (audience_size >= 0),
  about text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now()
);

create table if not exists public.games (
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

create table if not exists public.rsvps (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_name text not null check (char_length(trim(player_name)) between 2 and 40),
  state text not null check (state in ('joined', 'waitlist')),
  paid_claimed boolean not null default false,
  paid_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists rsvps_one_per_name on public.rsvps (game_id, lower(player_name));

-- ---------- Row level security ----------

alter table public.admins enable row level security;
alter table public.hosts enable row level security;
alter table public.games enable row level security;
alter table public.rsvps enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create policy "admins read own row" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Hosts: apply yourself (pending only), read your own, admin approves/denies
create policy "apply as host" on public.hosts
  for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy "read own host or admin" on public.hosts
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "admin manages hosts" on public.hosts
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Games: public sees approved games; approved hosts submit pending games; admin approves
create policy "public reads approved games" on public.games
  for select to anon, authenticated using (status = 'approved');
create policy "host reads own games" on public.games
  for select to authenticated using (host_id in (select id from public.hosts where user_id = auth.uid()));
create policy "admin reads all games" on public.games
  for select to authenticated using (public.is_admin());
create policy "approved host submits game" on public.games
  for insert to authenticated with check (
    status = 'pending'
    and host_id in (select id from public.hosts where user_id = auth.uid() and status = 'approved')
  );
create policy "admin manages games" on public.games
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- RSVPs: anyone sees rsvps for approved games; host/admin see and confirm payments.
-- Joining, leaving and claiming payment go through the functions below, not direct writes.
create policy "public reads rsvps of approved games" on public.rsvps
  for select to anon, authenticated using (
    exists (select 1 from public.games g where g.id = game_id and g.status = 'approved')
  );
create policy "host or admin reads rsvps" on public.rsvps
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.games g join public.hosts h on h.id = g.host_id
               where g.id = game_id and h.user_id = auth.uid())
  );
create policy "host or admin confirms payment" on public.rsvps
  for update to authenticated using (
    public.is_admin()
    or exists (select 1 from public.games g join public.hosts h on h.id = g.host_id
               where g.id = game_id and h.user_id = auth.uid())
  ) with check (
    public.is_admin()
    or exists (select 1 from public.games g join public.hosts h on h.id = g.host_id
               where g.id = game_id and h.user_id = auth.uid())
  );

-- Anonymous visitors see names, status and payment flags (for the yellow chips), never rsvp ids.
revoke select on public.rsvps from anon;
grant select (game_id, player_name, state, created_at, paid_claimed, paid_confirmed) on public.rsvps to anon;

-- ---------- Functions used by players (no login needed) ----------

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
  if not found then
    raise exception 'This game is not open for sign-ups.';
  end if;
  if g.starts_at <= now() then
    raise exception 'This game has already started.';
  end if;

  if exists (select 1 from public.rsvps r where r.game_id = p_game and lower(r.player_name) = lower(clean)) then
    raise exception 'That name is already signed up for this game.';
  end if;

  select count(*) into joined_count from public.rsvps r where r.game_id = p_game and r.state = 'joined';
  new_state := case when joined_count < g.max_players then 'joined' else 'waitlist' end;

  insert into public.rsvps (game_id, player_name, state)
  values (p_game, clean, new_state)
  returning id into new_id;

  return query select new_id, new_state;
end $$;

create or replace function public.leave_game(p_rsvp uuid, p_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.rsvps%rowtype;
  next_id uuid;
begin
  select * into r from public.rsvps where id = p_rsvp;
  if not found or lower(r.player_name) <> lower(trim(p_name)) then
    raise exception 'Could not find your spot in this game.';
  end if;

  delete from public.rsvps where id = r.id;

  -- Move the first person on the waitlist into the freed spot
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
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.rsvps set paid_claimed = true
  where id = p_rsvp and lower(player_name) = lower(trim(p_name));
  if not found then
    raise exception 'Could not find your spot in this game.';
  end if;
end $$;

grant execute on function public.join_game(uuid, text) to anon, authenticated;
grant execute on function public.leave_game(uuid, text) to anon, authenticated;
grant execute on function public.mark_paid(uuid, text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------- Make yourself admin (run once, after you sign in with your email) ----------
-- insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';

# PitchFlow

Shareable pickup soccer app. The root URL is the link you paste into WhatsApp.

If you already ran an earlier version of `schema.sql`, run these two lines in the SQL editor to let players see payment status:

    revoke select on public.rsvps from anon;
    grant select (game_id, player_name, state, created_at, paid_claimed, paid_confirmed) on public.rsvps to anon;

## Setup

1. Create a Supabase project. In the SQL editor, run `supabase/schema.sql`.
2. Make yourself admin: sign in once at `/admin` with your email, then run the last line of `schema.sql` with your email.
3. Copy `.env.example` to `.env.local` and paste your project URL and anon key.
4. In Supabase Auth settings, add your site URL (`http://localhost:5173` for dev, your Vercel URL for production) to the redirect URLs.
5. `npm install`, then `npm run dev`.
6. Deploy to Vercel and add the same two environment variables there.

## Pages

- `/` : public game list. Players type a name and tap Join. Waitlist and "I've paid" included.
- `/host` : hosts sign in with email, apply, and once approved post games.
- `/admin` : approve hosts and games, confirm payments.

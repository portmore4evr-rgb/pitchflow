import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { formatWhen, money } from '../lib/format.js';
import PlayerChip from '../components/PlayerChip.jsx';

const NAME_KEY = 'pg_name';
const MINE_KEY = 'pg_mine'; // { [gameId]: { id, name } } - rsvp ids this phone created

export default function Home() {
  const [games, setGames] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [mine, setMine] = useState(() => JSON.parse(localStorage.getItem(MINE_KEY) || '{}'));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [g, r] = await Promise.all([
      supabase
        .from('games')
        .select('*')
        .eq('status', 'approved')
        .gte('starts_at', new Date().toISOString())
        .order('starts_at'),
      supabase
        .from('rsvps')
        .select('game_id, player_name, state, created_at, paid_claimed, paid_confirmed')
        .order('created_at'),
    ]);
    if (g.error) return setMsg(g.error.message);
    if (r.error) return setMsg(r.error.message);
    setGames(g.data || []);
    setRsvps(r.data || []);
  }

  useEffect(() => {
    load();
  }, []);

  function saveMine(next) {
    setMine(next);
    localStorage.setItem(MINE_KEY, JSON.stringify(next));
  }

  async function join(game) {
    const n = name.trim();
    if (n.length < 2) return setMsg('Type your name first.');
    localStorage.setItem(NAME_KEY, n);
    setBusy(true);
    setMsg('');
    const { data, error } = await supabase.rpc('join_game', { p_game: game.id, p_name: n });
    setBusy(false);
    if (error) return setMsg(error.message);
    const row = data[0];
    saveMine({ ...mine, [game.id]: { id: row.out_rsvp_id, name: n } });
    setMsg(
      row.out_state === 'joined'
        ? `You're in for ${game.title}!`
        : "That game is full, so you're on the waitlist. We'll move you up if a spot opens."
    );
    load();
  }

  async function leave(game) {
    const m = mine[game.id];
    if (!m) return setMsg('Only the phone you joined from can leave. Ask the host to remove you otherwise.');
    setBusy(true);
    setMsg('');
    const { error } = await supabase.rpc('leave_game', { p_rsvp: m.id, p_name: m.name });
    setBusy(false);
    if (error) return setMsg(error.message);
    const next = { ...mine };
    delete next[game.id];
    saveMine(next);
    setMsg('You left the game.');
    load();
  }

  async function claimPaid(game) {
    const m = mine[game.id];
    if (!m) return;
    setBusy(true);
    setMsg('');
    const { error } = await supabase.rpc('mark_paid', { p_rsvp: m.id, p_name: m.name });
    setBusy(false);
    if (error) return setMsg(error.message);
    setMsg("Thanks! Your payment is marked. It turns yellow once the host confirms it.");
    load();
  }

  const me = name.trim().toLowerCase();

  return (
    <>
      <section className="card">
        <h1>Pickup games</h1>
        <p className="muted">Pick a game below and tap Join. Type your name once and it's remembered on this phone.</p>
        <label>
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First name and last initial"
            maxLength={40}
          />
        </label>
        {msg && <p className="msg">{msg}</p>}
      </section>

      {games.length === 0 && <p className="card">No games posted yet. Check back soon.</p>}

      {games.map((game) => {
        const roster = rsvps.filter((r) => r.game_id === game.id);
        const joined = roster.filter((r) => r.state === 'joined');
        const waitlist = roster.filter((r) => r.state === 'waitlist');
        const mySpot = me ? roster.find((r) => r.player_name.toLowerCase() === me) : null;
        const full = joined.length >= game.max_players;
        const hasPrice = Number(game.price_per_player) > 0;

        return (
          <article className="card game" key={game.id}>
            <div className="badges">
              <span>{game.setting}</span>
              <span>{game.game_type}</span>
            </div>
            <h2>{game.title}</h2>
            <p>📅 {formatWhen(game.starts_at)}</p>
            <p>📍 {game.location}</p>
            <p>
              Hosted by {game.host_name} · {money(game.price_per_player)} per player
            </p>
            <p>
              {joined.length}/{game.max_players} spots
              {full ? ' · full' : ''}
            </p>

            {roster.length > 0 && (
              <div className="chips">
                {roster.map((r) => (
                  <PlayerChip key={`${r.player_name}-${r.created_at}`} player={r} paysFee={hasPrice} />
                ))}
              </div>
            )}

            {mySpot ? (
              <div className="actions">
                <p className="msg">You're {mySpot.state === 'joined' ? 'in' : 'on the waitlist'}.</p>
                {hasPrice && mySpot.paid_confirmed && <p className="paid-text">Payment confirmed ✓</p>}
                {hasPrice && !mySpot.paid_confirmed && mySpot.paid_claimed && (
                  <p className="muted">Payment sent. Waiting for the host to confirm.</p>
                )}
                <button className="ghost" onClick={() => leave(game)} disabled={busy}>
                  Leave game
                </button>
                {hasPrice && mine[game.id] && !mySpot.paid_claimed && (
                  <button onClick={() => claimPaid(game)} disabled={busy}>
                    I've paid
                  </button>
                )}
              </div>
            ) : (
              <button onClick={() => join(game)} disabled={busy}>
                {full ? 'Join waitlist' : 'Join game'}
              </button>
            )}

            {hasPrice && game.payment_instructions && (
              <div className="pay">
                <strong>Pay the host</strong>
                <p>{game.payment_instructions}</p>
              </div>
            )}
          </article>
        );
      })}
    </>
  );
}

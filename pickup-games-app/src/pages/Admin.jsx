import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useSession } from '../lib/session.js';
import { formatWhen, money } from '../lib/format.js';
import SignIn from '../components/SignIn.jsx';

export default function Admin() {
  const { session, ready } = useSession();
  const [isAdmin, setIsAdmin] = useState(null);

  useEffect(() => {
    if (!session) {
      setIsAdmin(null);
      return;
    }
    supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [session]);

  if (!ready) return <p className="card">Loading…</p>;
  if (!session) return <SignIn next="/admin" label="Admin sign-in" />;
  if (isAdmin === null) return <p className="card">Checking access…</p>;
  if (!isAdmin) return <p className="card">This account doesn't have admin access.</p>;
  return <Dashboard />;
}

function Dashboard() {
  const [hosts, setHosts] = useState([]);
  const [games, setGames] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [msg, setMsg] = useState('');

  async function load() {
    const [h, g, r] = await Promise.all([
      supabase.from('hosts').select('*').order('created_at', { ascending: false }),
      supabase.from('games').select('*').order('starts_at'),
      supabase.from('rsvps').select('*').order('created_at'),
    ]);
    const err = h.error || g.error || r.error;
    if (err) return setMsg(err.message);
    setHosts(h.data || []);
    setGames(g.data || []);
    setRsvps(r.data || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function update(table, id, values) {
    const { error } = await supabase.from(table).update(values).eq('id', id);
    if (error) return setMsg(error.message);
    setMsg('');
    load();
  }

  const pendingHosts = hosts.filter((h) => h.status === 'pending');
  const pendingGames = games.filter((g) => g.status === 'pending');
  const otherGames = games.filter((g) => g.status !== 'pending');

  return (
    <>
      <section className="card">
        <h1>Admin</h1>
        {msg && <p className="msg">{msg}</p>}
        <p className="muted">
          {pendingHosts.length} host applications and {pendingGames.length} games waiting for approval.
        </p>
      </section>

      <section>
        <h2 className="section-title">Host applications</h2>
        {hosts.length === 0 && <p className="card">No applications yet.</p>}
        {hosts.map((h) => (
          <div className="card" key={h.id}>
            <strong>{h.name}</strong> · <span className="muted">{h.status}</span>
            <p className="muted">
              {h.contact} · can bring about {h.audience_size} players
              {h.about ? ` · ${h.about}` : ''}
            </p>
            {h.status === 'pending' && (
              <div className="actions">
                <button onClick={() => update('hosts', h.id, { status: 'approved' })}>Approve</button>
                <button className="ghost" onClick={() => update('hosts', h.id, { status: 'denied' })}>Deny</button>
              </div>
            )}
            {h.status === 'approved' && (
              <button className="ghost" onClick={() => update('hosts', h.id, { status: 'denied' })}>Revoke</button>
            )}
          </div>
        ))}
      </section>

      <section>
        <h2 className="section-title">Games waiting for approval</h2>
        {pendingGames.length === 0 && <p className="card">Nothing waiting.</p>}
        {pendingGames.map((g) => (
          <GameCard
            key={g.id}
            game={g}
            rsvps={rsvps.filter((r) => r.game_id === g.id)}
            onStatus={(status) => update('games', g.id, { status })}
            onPaid={(r) => update('rsvps', r.id, { paid_confirmed: !r.paid_confirmed })}
          />
        ))}
      </section>

      <section>
        <h2 className="section-title">All other games</h2>
        {otherGames.map((g) => (
          <GameCard
            key={g.id}
            game={g}
            rsvps={rsvps.filter((r) => r.game_id === g.id)}
            onStatus={(status) => update('games', g.id, { status })}
            onPaid={(r) => update('rsvps', r.id, { paid_confirmed: !r.paid_confirmed })}
          />
        ))}
      </section>
    </>
  );
}

function GameCard({ game, rsvps, onStatus, onPaid }) {
  const paid = Number(game.price_per_player) > 0;
  return (
    <article className="card game">
      <div className="badges">
        <span>{game.status}</span>
        <span>{game.setting}</span>
        <span>{game.game_type}</span>
        <span>{money(game.price_per_player)}</span>
      </div>
      <h3>{game.title}</h3>
      <p>
        📅 {formatWhen(game.starts_at)} · 📍 {game.location} · hosted by {game.host_name}
      </p>
      {game.payment_instructions && <p className="muted">Pay: {game.payment_instructions}</p>}

      <div className="actions">
        {game.status === 'pending' && (
          <>
            <button onClick={() => onStatus('approved')}>Approve</button>
            <button className="ghost" onClick={() => onStatus('rejected')}>Reject</button>
          </>
        )}
        {game.status === 'approved' && (
          <button className="ghost" onClick={() => onStatus('cancelled')}>Cancel game</button>
        )}
      </div>

      {rsvps.length === 0 && <p className="muted">No players yet.</p>}
      {rsvps.map((r) => (
        <div className={`row${r.paid_confirmed ? ' paid' : ''}`} key={r.id}>
          <span>
            {r.player_name} {r.state === 'waitlist' ? '(waitlist)' : ''}
            {!r.paid_confirmed && r.paid_claimed ? ' · says paid' : ''}
          </span>
          {paid && (
            <button className={r.paid_confirmed ? 'ghost' : ''} onClick={() => onPaid(r)}>
              {r.paid_confirmed ? 'Paid ✓' : 'Confirm paid'}
            </button>
          )}
        </div>
      ))}
    </article>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { formatWhen, money } from '../lib/format.js';

const KEY = 'pf_admin'; // admin passcode kept for this browser tab only

export default function Admin() {
  const [pass, setPass] = useState(() => sessionStorage.getItem(KEY) || '');
  const [input, setInput] = useState('');
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');

  async function load(p) {
    const { data: d, error } = await supabase.rpc('admin_overview', { p_pass: p });
    if (error) {
      setMsg(error.message);
      setData(null);
      sessionStorage.removeItem(KEY);
      setPass('');
      return;
    }
    setMsg('');
    setData(d);
  }

  useEffect(() => {
    if (pass) load(pass);
  }, [pass]);

  if (!pass) {
    return (
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          sessionStorage.setItem(KEY, input);
          setPass(input);
        }}
      >
        <h2>Admin</h2>
        <label>
          Admin passcode
          <input type="password" value={input} onChange={(e) => setInput(e.target.value)} />
        </label>
        <button type="submit">Open admin</button>
        {msg && <p className="msg">{msg}</p>}
      </form>
    );
  }

  if (!data) return <p className="card">{msg || 'Loading…'}</p>;

  async function run(fn, args) {
    const { error } = await supabase.rpc(fn, { p_pass: pass, ...args });
    if (error) return setMsg(error.message);
    setMsg('');
    load(pass);
  }

  const pendingHosts = data.hosts.filter((h) => h.status === 'pending');
  const pendingGames = data.games.filter((g) => g.status === 'pending');
  const otherGames = data.games.filter((g) => g.status !== 'pending');

  function GameCard({ game }) {
    const list = data.rsvps.filter((r) => r.game_id === game.id);
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
              <button onClick={() => run('admin_set_game', { p_id: game.id, p_status: 'approved' })}>Approve</button>
              <button className="ghost" onClick={() => run('admin_set_game', { p_id: game.id, p_status: 'rejected' })}>
                Reject
              </button>
            </>
          )}
          {game.status === 'approved' && (
            <button className="ghost" onClick={() => run('admin_set_game', { p_id: game.id, p_status: 'cancelled' })}>
              Cancel game
            </button>
          )}
        </div>

        {list.length === 0 && <p className="muted">No players yet.</p>}
        {list.map((r) => (
          <div className={`row${r.paid_confirmed ? ' paid' : ''}`} key={r.id}>
            <span>
              {r.player_name} {r.state === 'waitlist' ? '(waitlist)' : ''}
              {!r.paid_confirmed && r.paid_claimed ? ' · says paid' : ''}
            </span>
            {paid && (
              <button
                className={r.paid_confirmed ? 'ghost' : ''}
                onClick={() => run('admin_set_paid', { p_rsvp: r.id, p_value: !r.paid_confirmed })}
              >
                {r.paid_confirmed ? 'Paid ✓' : 'Confirm paid'}
              </button>
            )}
          </div>
        ))}
      </article>
    );
  }

  return (
    <>
      <section className="card">
        <h1>Admin</h1>
        {msg && <p className="msg">{msg}</p>}
        <p className="muted">
          {pendingHosts.length} host applications and {pendingGames.length} games waiting for approval.
        </p>
        <button
          className="ghost"
          onClick={() => {
            sessionStorage.removeItem(KEY);
            setPass('');
            setData(null);
          }}
        >
          Log out
        </button>
      </section>

      <section>
        <h2 className="section-title">Host applications</h2>
        {data.hosts.length === 0 && <p className="card">No applications yet.</p>}
        {data.hosts.map((h) => (
          <div className="card" key={h.id}>
            <strong>{h.name}</strong> · <span className="muted">{h.status}</span>
            <p className="muted">
              {h.contact} · can bring about {h.audience_size} players
              {h.about ? ` · ${h.about}` : ''}
            </p>
            {h.status === 'pending' && (
              <div className="actions">
                <button onClick={() => run('admin_set_host', { p_id: h.id, p_status: 'approved' })}>Approve</button>
                <button className="ghost" onClick={() => run('admin_set_host', { p_id: h.id, p_status: 'denied' })}>
                  Deny
                </button>
              </div>
            )}
            {h.status === 'approved' && (
              <button className="ghost" onClick={() => run('admin_set_host', { p_id: h.id, p_status: 'denied' })}>
                Revoke
              </button>
            )}
          </div>
        ))}
      </section>

      <section>
        <h2 className="section-title">Games waiting for approval</h2>
        {pendingGames.length === 0 && <p className="card">Nothing waiting.</p>}
        {pendingGames.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </section>

      <section>
        <h2 className="section-title">All other games</h2>
        {otherGames.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </section>
    </>
  );
}

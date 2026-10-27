import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useSession } from '../lib/session.js';
import { GAME_TYPES, SETTINGS, formatWhen } from '../lib/format.js';
import SignIn from '../components/SignIn.jsx';

export default function Host() {
  const { session, ready } = useSession();
  if (!ready) return <p className="card">Loading…</p>;
  if (!session) {
    return (
      <>
        <section className="card">
          <h1>Host a game</h1>
          <p className="muted">
            Hosting is by approval only. Sign in with your email, tell us about yourself, and the admin will approve you.
          </p>
        </section>
        <SignIn next="/host" label="Host sign-in" />
      </>
    );
  }
  return <HostArea userId={session.user.id} />;
}

function HostArea({ userId }) {
  const [host, setHost] = useState(undefined); // undefined = loading, null = not applied yet
  const [msg, setMsg] = useState('');

  async function loadHost() {
    const { data, error } = await supabase.from('hosts').select('*').eq('user_id', userId).maybeSingle();
    if (error) return setMsg(error.message);
    setHost(data);
  }

  useEffect(() => {
    loadHost();
  }, [userId]);

  if (msg) return <p className="card msg">{msg}</p>;
  if (host === undefined) return <p className="card">Loading…</p>;
  if (host === null) return <ApplyForm onDone={loadHost} />;
  if (host.status === 'pending') {
    return <p className="card">Your host application is under review. You'll hear back from the admin.</p>;
  }
  if (host.status === 'denied') {
    return <p className="card">Your host application wasn't approved this time.</p>;
  }
  return <HostGames host={host} />;
}

function ApplyForm({ onDone }) {
  const [form, setForm] = useState({ name: '', contact: '', audience_size: '', about: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('hosts').insert({
      user_id: auth.user.id,
      name: form.name.trim(),
      contact: form.contact.trim(),
      audience_size: Number(form.audience_size) || 0,
      about: form.about.trim() || null,
    });
    setBusy(false);
    if (error) return setMsg(error.message);
    onDone();
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <form className="card" onSubmit={submit}>
      <h2>Apply to host</h2>
      <label>
        Your name
        <input required value={form.name} onChange={set('name')} />
      </label>
      <label>
        Best contact (phone or WhatsApp)
        <input required value={form.contact} onChange={set('contact')} />
      </label>
      <label>
        How many players can you bring?
        <input type="number" min="0" required value={form.audience_size} onChange={set('audience_size')} />
      </label>
      <label>
        Anything else the admin should know
        <textarea rows="3" value={form.about} onChange={set('about')} />
      </label>
      <button type="submit" disabled={busy}>Submit application</button>
      {msg && <p className="msg">{msg}</p>}
    </form>
  );
}

function HostGames({ host }) {
  const blank = {
    title: '',
    game_type: GAME_TYPES[0],
    setting: SETTINGS[0],
    location: '',
    starts_at: '',
    max_players: 10,
    price_per_player: 0,
    payment_instructions: '',
  };
  const [form, setForm] = useState(blank);
  const [games, setGames] = useState([]);
  const [rsvps, setRsvps] = useState([]);
  const [msg, setMsg] = useState('');

  async function load() {
    const { data: g, error } = await supabase
      .from('games')
      .select('*')
      .eq('host_id', host.id)
      .order('starts_at', { ascending: false });
    if (error) return setMsg(error.message);
    setGames(g || []);
    const ids = (g || []).map((x) => x.id);
    if (ids.length) {
      const { data: r } = await supabase.from('rsvps').select('*').in('game_id', ids).order('created_at');
      setRsvps(r || []);
    } else {
      setRsvps([]);
    }
  }

  useEffect(() => {
    load();
  }, [host.id]);

  async function create(e) {
    e.preventDefault();
    setMsg('');
    const { error } = await supabase.from('games').insert({
      host_id: host.id,
      host_name: host.name,
      title: form.title.trim(),
      game_type: form.game_type,
      setting: form.setting,
      location: form.location.trim(),
      starts_at: new Date(form.starts_at).toISOString(),
      max_players: Number(form.max_players),
      price_per_player: Number(form.price_per_player) || 0,
      payment_instructions: form.payment_instructions.trim() || null,
    });
    if (error) return setMsg(error.message);
    setForm(blank);
    setMsg('Game submitted. The admin will approve it before it goes live.');
    load();
  }

  async function togglePaid(r) {
    const { error } = await supabase.from('rsvps').update({ paid_confirmed: !r.paid_confirmed }).eq('id', r.id);
    if (error) return setMsg(error.message);
    load();
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <section className="card">
        <h1>Host a game</h1>
        <p className="muted">Welcome, {host.name}. Post a game below. Players will see it once the admin approves it.</p>
      </section>

      <form className="card" onSubmit={create}>
        <h2>New game</h2>
        <label>
          Title
          <input required value={form.title} onChange={set('title')} placeholder="Tuesday night run" />
        </label>
        <label>
          Game type
          <select value={form.game_type} onChange={set('game_type')}>
            {GAME_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Indoor or outdoor
          <select value={form.setting} onChange={set('setting')}>
            {SETTINGS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Location
          <input required value={form.location} onChange={set('location')} placeholder="Field name and address" />
        </label>
        <label>
          Date and time
          <input type="datetime-local" required value={form.starts_at} onChange={set('starts_at')} />
        </label>
        <label>
          Max players
          <input type="number" min="2" max="50" required value={form.max_players} onChange={set('max_players')} />
        </label>
        <label>
          Price per player ($, 0 for free)
          <input type="number" min="0" step="0.01" value={form.price_per_player} onChange={set('price_per_player')} />
        </label>
        <label>
          Payment instructions (for paid games)
          <textarea
            rows="3"
            value={form.payment_instructions}
            onChange={set('payment_instructions')}
            placeholder="Cash App $yourtag · Venmo @yourhandle. Include the field booking reference if you have one."
          />
        </label>
        <button type="submit">Submit game for approval</button>
        {msg && <p className="msg">{msg}</p>}
      </form>

      <section>
        <h2 className="section-title">Your games</h2>
        {games.length === 0 && <p className="card">No games yet.</p>}
        {games.map((g) => {
          const list = rsvps.filter((r) => r.game_id === g.id);
          return (
            <article className="card game" key={g.id}>
              <div className="badges">
                <span>{g.status}</span>
                <span>{g.setting}</span>
                <span>{g.game_type}</span>
              </div>
              <h3>{g.title}</h3>
              <p>📅 {formatWhen(g.starts_at)} · 📍 {g.location}</p>
              {list.length === 0 && <p className="muted">No players yet.</p>}
              {list.map((r) => (
                <div className={`row${r.paid_confirmed ? ' paid' : ''}`} key={r.id}>
                  <span>
                    {r.player_name} {r.state === 'waitlist' ? '(waitlist)' : ''}
                    {!r.paid_confirmed && r.paid_claimed ? ' · says paid' : ''}
                  </span>
                  {Number(g.price_per_player) > 0 && (
                    <button className={r.paid_confirmed ? 'ghost' : ''} onClick={() => togglePaid(r)}>
                      {r.paid_confirmed ? 'Paid ✓' : 'Confirm paid'}
                    </button>
                  )}
                </div>
              ))}
            </article>
          );
        })}
      </section>
    </>
  );
}

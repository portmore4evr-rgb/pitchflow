import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { GAME_TYPES, SETTINGS, formatWhen } from '../lib/format.js';

const KEY = 'pf_host'; // { name, pin } saved on this phone after logging in

export default function Host() {
  const [creds, setCreds] = useState(() => JSON.parse(localStorage.getItem(KEY) || 'null'));

  if (!creds) {
    return (
      <Entry
        onLogin={(c) => {
          localStorage.setItem(KEY, JSON.stringify(c));
          setCreds(c);
        }}
      />
    );
  }
  return (
    <Dashboard
      creds={creds}
      onLogout={() => {
        localStorage.removeItem(KEY);
        setCreds(null);
      }}
    />
  );
}

function Entry({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', pin: '', contact: '', audience_size: '', about: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const name = form.name.trim();
    const pin = form.pin.trim();

    if (mode === 'apply') {
      const { error } = await supabase.rpc('host_apply', {
        p_name: name,
        p_pin: pin,
        p_contact: form.contact.trim(),
        p_audience: Number(form.audience_size) || 0,
        p_about: form.about.trim() || null,
      });
      setBusy(false);
      if (error) return setMsg(error.message);
      setMode('login');
      return setMsg('Application sent! Log in with the same name and PIN once the admin approves you.');
    }

    const { error } = await supabase.rpc('host_dashboard', { p_name: name, p_pin: pin });
    setBusy(false);
    if (error) return setMsg(error.message);
    onLogin({ name, pin });
  }

  return (
    <>
      <section className="card">
        <h1>Host a game</h1>
        <div className="actions">
          <button className={mode === 'login' ? '' : 'ghost'} onClick={() => setMode('login')} type="button">
            Log in
          </button>
          <button className={mode === 'apply' ? '' : 'ghost'} onClick={() => setMode('apply')} type="button">
            Apply to host
          </button>
        </div>
      </section>

      <form className="card" onSubmit={submit}>
        <label>
          Your name
          <input required value={form.name} onChange={set('name')} />
        </label>
        <label>
          PIN (4 to 8 digits, you choose it)
          <input
            required
            inputMode="numeric"
            type="password"
            value={form.pin}
            onChange={set('pin')}
          />
        </label>
        {mode === 'apply' && (
          <>
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
          </>
        )}
        <button type="submit" disabled={busy}>
          {mode === 'apply' ? 'Submit application' : 'Log in'}
        </button>
        {msg && <p className="msg">{msg}</p>}
      </form>
    </>
  );
}

function Dashboard({ creds, onLogout }) {
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
  const [data, setData] = useState(null);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState('');

  async function load() {
    const { data: d, error } = await supabase.rpc('host_dashboard', { p_name: creds.name, p_pin: creds.pin });
    if (error) return setMsg(error.message);
    setData(d);
  }

  useEffect(() => {
    load();
  }, [creds.name, creds.pin]);

  if (!data) return <p className="card">{msg || 'Loading…'}</p>;

  if (data.host.status !== 'approved') {
    const waiting = data.host.status === 'pending';
    return (
      <section className="card">
        <p>
          {waiting
            ? 'Your application is waiting for approval. Check back later.'
            : "Your host application wasn't approved this time."}
        </p>
        <button className="ghost" onClick={onLogout}>Log out</button>
      </section>
    );
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function create(e) {
    e.preventDefault();
    setMsg('');
    const { error } = await supabase.rpc('host_create_game', {
      p_name: creds.name,
      p_pin: creds.pin,
      p_title: form.title,
      p_type: form.game_type,
      p_setting: form.setting,
      p_location: form.location,
      p_starts: new Date(form.starts_at).toISOString(),
      p_max: Number(form.max_players),
      p_price: Number(form.price_per_player) || 0,
      p_pay: form.payment_instructions,
    });
    if (error) return setMsg(error.message);
    setForm(blank);
    setMsg('Game submitted. The admin will approve it before it goes live.');
    load();
  }

  async function togglePaid(r) {
    const { error } = await supabase.rpc('host_set_paid', {
      p_name: creds.name,
      p_pin: creds.pin,
      p_rsvp: r.id,
      p_value: !r.paid_confirmed,
    });
    if (error) return setMsg(error.message);
    load();
  }

  return (
    <>
      <section className="card">
        <h1>Host a game</h1>
        <p className="muted">Welcome, {creds.name}.</p>
        <button className="ghost" onClick={onLogout}>Log out</button>
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
            placeholder="Cash App $yourtag · Venmo @yourhandle"
          />
        </label>
        <button type="submit">Submit game for approval</button>
        {msg && <p className="msg">{msg}</p>}
      </form>

      <section>
        <h2 className="section-title">Your games</h2>
        {data.games.length === 0 && <p className="card">No games yet.</p>}
        {data.games.map((g) => {
          const list = data.rsvps.filter((r) => r.game_id === g.id);
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

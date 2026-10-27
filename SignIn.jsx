import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

// Email magic link for hosts and admin. Players never see this.
export default function SignIn({ next, label }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  async function send(e) {
    e.preventDefault();
    setErr('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}${next}` },
    });
    if (error) setErr(error.message);
    else setSent(true);
  }

  if (sent) {
    return (
      <div className="card">
        <p>Check your email for a sign-in link, then open it on this phone.</p>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={send}>
      <h2>{label}</h2>
      <label>
        Email
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button type="submit">Email me a sign-in link</button>
      {err && <p className="msg">{err}</p>}
    </form>
  );
}

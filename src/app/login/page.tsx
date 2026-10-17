'use client';

import { api } from '@/lib/client';
import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/api/auth/login', { method: 'POST', body: { password } });
      window.location.href = '/';
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login stack" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-dot" /> Live Streaming Recorder
        </div>
        <div>
          <label className="label" htmlFor="pw">
            Password
          </label>
          <input
            id="pw"
            className="input"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {err && <div className="alert error">{err}</div>}
        <button className="btn primary" disabled={busy || !password}>
          {busy ? 'Masuk…' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}

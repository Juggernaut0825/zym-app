'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { register } from '@/lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!username.trim() || password.length < 6) {
      setError('Username is required and password must be at least 6 characters.');
      return;
    }

    try {
      setPending(true);
      await register(username.trim(), email.trim(), password);
      router.push('/login');
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <section className="surface-card zym-enter" style={{ width: 'min(560px, 100%)', padding: 30, position: 'relative', overflow: 'hidden' }}>
        <span className="brand-orb zym-pulse" style={{ width: 100, height: 100, background: 'rgba(143,161,143,0.24)', top: -30, right: -20 }} />
        <span className="brand-orb zym-float" style={{ width: 60, height: 60, background: 'rgba(95,110,95,0.2)', left: -12, bottom: 34 }} />
        <h1 style={{ fontSize: 38 }}>Create your account</h1>
        <p style={{ marginTop: 8, color: 'var(--ink-500)' }}>After signing up, choose ZJ or LC and enter the community.</p>

        <form onSubmit={onSubmit} style={{ marginTop: 22, display: 'grid', gap: 12 }} className="zym-enter zym-delay-1">
          <input className="input-shell" placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
          <input className="input-shell" placeholder="Email (optional)" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input className="input-shell" placeholder="Password" value={password} type="password" onChange={(event) => setPassword(event.target.value)} />

          {error && <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>}

          <button className={`btn btn-primary ${pending ? 'zym-shimmer' : ''}`} disabled={pending} type="submit">
            {pending ? 'Creating...' : 'Register'}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => router.push('/login')}>
            Back to login
          </button>
        </form>
      </section>
    </main>
  );
}

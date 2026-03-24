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
    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedUsername || !normalizedEmail || password.length < 8) {
      setError('Username, email, and password must be provided. Password must be at least 8 characters.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    try {
      setPending(true);
      await register(normalizedUsername, normalizedEmail, password);
      router.push(`/verify-email?email=${encodeURIComponent(normalizedEmail)}&sent=1&redirect=coach-select`);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-8">
      <section
        className="surface-card zym-enter relative w-full max-w-[500px] overflow-hidden p-7 text-sm text-[color:var(--ink-900)] sm:p-8"
      >
        <span className="brand-orb zym-pulse" style={{ width: 100, height: 100, background: 'rgba(108,124,246,0.18)', top: -30, right: -20 }} />
        <span className="brand-orb zym-float" style={{ width: 60, height: 60, background: 'rgba(242,138,58,0.18)', left: -12, bottom: 34 }} />
        <h1 className="text-[1.625rem] font-semibold tracking-tight text-[color:var(--ink-900)] sm:text-[1.875rem]">Create your account</h1>

        <form onSubmit={onSubmit} style={{ marginTop: 22, display: 'grid', gap: 12 }} className="zym-enter zym-delay-1">
          <input className="input-shell text-sm" placeholder="Username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          <input
            className="input-shell text-sm"
            placeholder="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input className="input-shell text-sm" placeholder="Password" autoComplete="new-password" value={password} type="password" onChange={(event) => setPassword(event.target.value)} />

          {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}

          <button className={`btn btn-primary text-sm ${pending ? 'zym-shimmer' : ''}`} disabled={pending} type="submit">
            {pending ? 'Creating...' : 'Register'}
          </button>
          <button className="btn btn-ghost text-sm" type="button" onClick={() => router.push('/login')}>
            Back to login
          </button>
        </form>
      </section>
    </main>
  );
}

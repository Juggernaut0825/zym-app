'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';
import { setAuth } from '@/lib/auth-storage';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }

    try {
      setPending(true);
      const auth = await login(username.trim(), password);
      setAuth(auth);
      const hasCoach = auth.selectedCoach === 'zj' || auth.selectedCoach === 'lc';
      router.push(hasCoach ? '/app' : '/coach-select');
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <section className="surface-card auth-shell zym-enter" style={{ position: 'relative' }}>
        <span className="brand-orb zym-pulse" style={{ width: 120, height: 120, background: 'rgba(95,110,95,0.24)', top: -26, left: -30 }} />
        <span className="brand-orb zym-float" style={{ width: 86, height: 86, background: 'rgba(143,161,143,0.26)', right: 16, top: 14 }} />

        <div className="auth-hero zym-enter zym-delay-1">
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, border: '1px solid #b9cbbf', background: 'rgba(255,255,255,0.7)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#1f9d5b' }} />
            <span style={{ fontSize: 12, color: 'var(--ink-700)', fontWeight: 600 }}>Lifestyle Fitness Community</span>
          </div>
          <h1 style={{ marginTop: 20, fontSize: 52, lineHeight: 1.05 }}>Welcome to ZYM</h1>
          <p style={{ marginTop: 14, color: 'var(--ink-500)', maxWidth: 420, fontSize: 18 }}>
            Pick your AI coach, connect with friends, and manage training, nutrition, and daily habits in one premium community app.
          </p>
          <div style={{ marginTop: 32, display: 'grid', gap: 12 }}>
            <div className="surface-subtle" style={{ padding: 12 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>Coach Persona</strong>
              <span style={{ color: 'var(--ink-500)', fontSize: 14 }}>Switch between ZJ (encouraging) and LC (strict)</span>
            </div>
            <div className="surface-subtle" style={{ padding: 12 }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>Community First</strong>
              <span style={{ color: 'var(--ink-500)', fontSize: 14 }}>Group chat + DM + Feed + Leaderboard in one flow</span>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="auth-form zym-enter zym-delay-2">
          <h2 style={{ fontSize: 30 }}>Sign in</h2>
          <p style={{ color: 'var(--ink-500)', marginTop: 8 }}>Continue your fitness journey</p>

          <div style={{ marginTop: 24, display: 'grid', gap: 12 }}>
            <input className="input-shell" placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
            <input
              className="input-shell"
              placeholder="Password"
              value={password}
              type="password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && <p style={{ marginTop: 12, color: 'var(--danger)', fontSize: 14 }}>{error}</p>}

          <button type="submit" className={`btn btn-primary ${pending ? 'zym-shimmer' : ''}`} disabled={pending} style={{ marginTop: 18, width: '100%' }}>
            {pending ? 'Signing in...' : 'Login'}
          </button>

          <button type="button" className="btn btn-ghost" style={{ marginTop: 10, width: '100%' }} onClick={() => router.push('/register')}>
            Create account
          </button>
        </form>
      </section>
    </main>
  );
}

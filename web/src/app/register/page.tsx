'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { register } from '@/lib/api';

const HEALTH_DISCLAIMER_VERSION = '2026-03-26';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedHealthDisclaimer, setAcceptedHealthDisclaimer] = useState(false);
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

    if (!acceptedHealthDisclaimer) {
      setError('Please confirm the health disclaimer before creating your account.');
      return;
    }

    try {
      setPending(true);
      await register(normalizedUsername, normalizedEmail, password, {
        healthDisclaimerAccepted: true,
        consentVersion: HEALTH_DISCLAIMER_VERSION,
      });
      router.push(`/verify-email?email=${encodeURIComponent(normalizedEmail)}&sent=1&redirect=welcome`);
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

          <label className="rounded-[20px] border border-white/65 bg-white/65 p-4 text-sm leading-6 text-slate-600">
            <span className="mb-3 flex items-start gap-3">
              <input
                type="checkbox"
                checked={acceptedHealthDisclaimer}
                onChange={(event) => setAcceptedHealthDisclaimer(event.target.checked)}
                className="mt-1 size-4 rounded border-slate-300"
              />
              <span>
                I understand ZYM AI Coach is not medical advice. If I have injuries, medical conditions, chest pain, severe pain, dizziness, or urgent symptoms, I should stop and seek professional or emergency care. I agree to the Terms and Health Disclaimer.
              </span>
            </span>
            <span className="block text-xs text-slate-500">
              Full details:
              {' '}
              <button
                type="button"
                className="font-semibold text-[color:var(--coach-zj)]"
                onClick={() => router.push('/health-disclaimer')}
              >
                Health Disclaimer
              </button>
            </span>
          </label>

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

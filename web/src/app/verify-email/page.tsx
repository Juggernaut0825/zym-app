'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { requestEmailVerification, verifyEmail } from '@/lib/api';

function VerifyEmailScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = String(searchParams.get('token') || '').trim();
  const [email, setEmail] = useState(String(searchParams.get('email') || '').trim());
  const [pending, setPending] = useState(Boolean(token));
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState(
    searchParams.get('sent') === '1'
      ? 'Check your inbox for a verification email. Once you verify, you can sign in.'
      : 'Enter your email to get a new verification link.',
  );
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    setPending(true);
    setError('');
    setMessage('Verifying your email...');

    void verifyEmail(token)
      .then(() => {
        if (cancelled) return;
        setVerified(true);
        setMessage('Your email has been verified. You can sign in now.');
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err.message || 'This verification link is invalid or expired.');
        setMessage('Need a new verification email?');
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setError('');

    if (!normalizedEmail) {
      setError('Please enter your email address.');
      return;
    }

    try {
      setPending(true);
      await requestEmailVerification(normalizedEmail);
      setMessage('If the account exists, a new verification email has been sent.');
    } catch (err: any) {
      setError(err.message || 'Failed to send verification email.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-8">
      <section className="surface-card relative w-full max-w-[500px] overflow-hidden p-7 text-sm text-[color:var(--ink-900)] sm:p-8">
        <span className="brand-orb zym-pulse" style={{ width: 100, height: 100, background: 'rgba(108,124,246,0.18)', top: -30, right: -20 }} />
        <span className="brand-orb zym-float" style={{ width: 60, height: 60, background: 'rgba(242,138,58,0.18)', left: -12, bottom: 34 }} />

        <h1 className="text-[1.625rem] font-semibold tracking-tight text-[color:var(--ink-900)] sm:text-[1.875rem]">Verify your email</h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--ink-500)]">{message}</p>
        {error ? <p className="mt-3 text-sm text-[color:var(--danger)]">{error}</p> : null}

        {verified ? (
          <div className="mt-6 grid gap-3">
            <button className="btn btn-primary text-sm" type="button" onClick={() => router.push('/login')}>
              Back to login
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 grid gap-3">
            <input
              className="input-shell text-sm"
              placeholder="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button className="btn btn-primary text-sm" disabled={pending} type="submit">
              {pending ? 'Sending...' : 'Send verification email'}
            </button>
            <button className="btn btn-ghost text-sm" type="button" onClick={() => router.push('/login')}>
              Back to login
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center px-5 py-8 text-sm text-[color:var(--ink-500)]">Loading...</main>}>
      <VerifyEmailScreen />
    </Suspense>
  );
}

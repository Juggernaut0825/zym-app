'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { requestEmailVerification, verifyEmail } from '@/lib/api';

function VerifyEmailScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = String(searchParams.get('token') || '').trim();
  const email = String(searchParams.get('email') || '').trim();
  const redirect = String(searchParams.get('redirect') || '').trim();
  const [pending, setPending] = useState(Boolean(token));
  const [verified, setVerified] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [resent, setResent] = useState(false);
  const [message, setMessage] = useState(
    searchParams.get('sent') === '1'
      ? 'Check your inbox for a verification email. Delivery can take a minute. Once you verify, you can sign in.'
      : 'Verifying your email...',
  );
  const [error, setError] = useState('');

  const postVerifyUrl = redirect === 'coach-select'
    ? `/login?email=${encodeURIComponent(email)}&next=coach-select`
    : '/login';

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
        setMessage('Your email has been verified. Redirecting...');
        setTimeout(() => {
          router.push(postVerifyUrl);
        }, 1500);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err.message || 'This verification link is invalid or expired.');
        setMessage('');
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, postVerifyUrl, router]);

  async function handleResend() {
    if (!email || resendPending) return;
    try {
      setResendPending(true);
      setError('');
      setResent(false);
      const result = await requestEmailVerification(email);
      setMessage(result.message || 'A new verification email has been sent if the account exists.');
      setResent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email.');
    } finally {
      setResendPending(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-8">
      <section className="surface-card relative w-full max-w-[500px] overflow-hidden p-7 text-sm text-[color:var(--ink-900)] sm:p-8">
        <span className="brand-orb zym-pulse" style={{ width: 100, height: 100, background: 'rgba(108,124,246,0.18)', top: -30, right: -20 }} />
        <span className="brand-orb zym-float" style={{ width: 60, height: 60, background: 'rgba(242,138,58,0.18)', left: -12, bottom: 34 }} />

        <h1 className="text-[1.625rem] font-semibold tracking-tight text-[color:var(--ink-900)] sm:text-[1.875rem]">Verify your email</h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--ink-500)]">{message}</p>
        {error ? <p className="mt-3 text-sm text-[color:var(--danger)]">{error}</p> : null}
        {resent ? <p className="mt-3 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">Verification email sent if the address matches an unverified account.</p> : null}

        {email && (!token || Boolean(error)) ? (
          <div className="mt-6 grid gap-3">
            <button className="btn btn-ghost text-sm" type="button" onClick={() => void handleResend()} disabled={resendPending}>
              {resendPending ? 'Sending...' : 'Resend verification email'}
            </button>
          </div>
        ) : null}

        {verified && (
          <div className="mt-6 grid gap-3">
            <button className="btn btn-primary text-sm" type="button" onClick={() => router.push(postVerifyUrl)}>
              {redirect === 'coach-select' ? 'Sign in to choose coach' : 'Back to login'}
            </button>
          </div>
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

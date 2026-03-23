'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { resetPassword } from '@/lib/api';

function ResetPasswordScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = String(searchParams.get('token') || '').trim();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('Choose a new password for your account.');
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!token) {
      setError('This reset link is missing a token.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setPending(true);
      await resetPassword(token, password);
      setCompleted(true);
      setMessage('Your password has been updated. You can sign in now.');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-8">
      <section className="surface-card relative w-full max-w-[500px] overflow-hidden p-7 text-sm text-[color:var(--ink-900)] sm:p-8">
        <span className="brand-orb zym-pulse" style={{ width: 100, height: 100, background: 'rgba(108,124,246,0.18)', top: -30, right: -20 }} />
        <span className="brand-orb zym-float" style={{ width: 60, height: 60, background: 'rgba(242,138,58,0.18)', left: -12, bottom: 34 }} />

        <h1 className="text-[1.625rem] font-semibold tracking-tight text-[color:var(--ink-900)] sm:text-[1.875rem]">Choose a new password</h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--ink-500)]">{message}</p>
        {error ? <p className="mt-3 text-sm text-[color:var(--danger)]">{error}</p> : null}

        {completed ? (
          <div className="mt-6 grid gap-3">
            <button className="btn btn-primary text-sm" type="button" onClick={() => router.push('/login')}>
              Back to login
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 grid gap-3">
            <input
              className="input-shell text-sm"
              placeholder="New password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <input
              className="input-shell text-sm"
              placeholder="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
            <button className="btn btn-primary text-sm" disabled={pending} type="submit">
              {pending ? 'Updating...' : 'Update password'}
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center px-5 py-8 text-sm text-[color:var(--ink-500)]">Loading...</main>}>
      <ResetPasswordScreen />
    </Suspense>
  );
}

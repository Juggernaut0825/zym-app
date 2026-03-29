'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestPasswordReset } from '@/lib/api';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('Enter your email and we will send a password reset link if the account exists.');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setError('');
    setSuccess(false);

    if (!normalizedEmail) {
      setError('Please enter your email address.');
      return;
    }

    try {
      setPending(true);
      await requestPasswordReset(normalizedEmail);
      setMessage('If the account exists, a password reset email has been sent.');
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to request password reset.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-8">
      <section className="surface-card relative w-full max-w-[500px] overflow-hidden p-7 text-sm text-[color:var(--ink-900)] sm:p-8">
        <span className="brand-orb zym-pulse" style={{ width: 100, height: 100, background: 'rgba(108,124,246,0.18)', top: -30, right: -20 }} />
        <span className="brand-orb zym-float" style={{ width: 60, height: 60, background: 'rgba(242,138,58,0.18)', left: -12, bottom: 34 }} />

        <h1 className="text-[1.625rem] font-semibold tracking-tight text-[color:var(--ink-900)] sm:text-[1.875rem]">Reset your password</h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--ink-500)]">{message}</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">Use the exact email address you registered with. We will only send reset links to that email.</p>
        {error ? <p className="mt-3 text-sm text-[color:var(--danger)]">{error}</p> : null}
        {success ? <p className="mt-3 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-700">Reset email sent if that registered account exists. Check spam if you do not see it soon.</p> : null}

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
            {pending ? 'Sending...' : 'Send reset email'}
          </button>
          <button className="btn btn-ghost text-sm" type="button" onClick={() => router.push('/login')}>
            Back to login
          </button>
        </form>
      </section>
    </main>
  );
}

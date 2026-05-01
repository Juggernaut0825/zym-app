'use client';

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login, loginWithApple, loginWithGoogle } from '@/lib/api';
import { setAuth } from '@/lib/auth-storage';
import { APPLE_CLIENT_ID, GOOGLE_CLIENT_ID, resolveAppleRedirectUri } from '@/lib/config';

const HEALTH_DISCLAIMER_VERSION = '2026-03-26';
const APPLE_SIGN_IN_SCRIPT_URL = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

let appleSignInScriptPromise: Promise<void> | null = null;

function randomOAuthValue(byteCount = 18): string {
  const bytes = new Uint8Array(byteCount);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return btoa(String.fromCharCode(...Array.from(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function loadAppleSignInScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Apple sign-in is only available in the browser.'));
  }
  if ((window as any).AppleID?.auth) {
    return Promise.resolve();
  }
  if (appleSignInScriptPromise) {
    return appleSignInScriptPromise;
  }

  appleSignInScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-apple-signin="true"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Apple sign-in could not be loaded.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = APPLE_SIGN_IN_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.dataset.appleSignin = 'true';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Apple sign-in could not be loaded.')), { once: true });
    document.head.appendChild(script);
  });

  return appleSignInScriptPromise;
}

function appleFullNameFromResponse(name: any): string | null {
  if (!name || typeof name !== 'object') return null;
  const rendered = [
    name.firstName,
    name.middleName,
    name.lastName,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return rendered || null;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0">
      <path fill="#4285F4" d="M23.5 12.2c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.4 7.4 0 0 1-11-3.9H1v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5 14.2a7.2 7.2 0 0 1 0-4.4V6.7H1a12 12 0 0 0 0 10.6l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8L20 3.1A12 12 0 0 0 1 6.7l4 3.1a7.1 7.1 0 0 1 7-5z" />
    </svg>
  );
}

function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [socialConsentAccepted, setSocialConsentAccepted] = useState(false);
  const [socialConsentWarning, setSocialConsentWarning] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const socialConsentAcceptedRef = useRef(false);
  const socialAuthAvailable = Boolean(GOOGLE_CLIENT_ID || APPLE_CLIENT_ID);

  const routeAfterLogin = (_selectedCoach: 'zj' | 'lc' | null) => {
    router.push('/app');
  };

  useEffect(() => {
    const email = String(searchParams.get('email') || '').trim();
    if (email) {
      setIdentifier((current) => current || email);
    }
  }, [searchParams]);

  useEffect(() => {
    socialConsentAcceptedRef.current = socialConsentAccepted;
    if (socialConsentAccepted) {
      setSocialConsentWarning('');
    }
  }, [socialConsentAccepted]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleButtonRef.current) return;

    let cancelled = false;
    const container = googleButtonRef.current;

    const handleGoogleCredential = async (credential: string) => {
      if (!socialConsentAcceptedRef.current) {
        setSocialConsentWarning('Please confirm Terms and Privacy before continuing with Google.');
        return;
      }
      if (!credential) {
        setError('Google sign-in did not return a credential.');
        return;
      }

      try {
        setPending(true);
        setError('');
        const auth = await loginWithGoogle(credential, {
          healthDisclaimerAccepted: socialConsentAcceptedRef.current,
          consentVersion: HEALTH_DISCLAIMER_VERSION,
        });
        setAuth(auth);
        routeAfterLogin(auth.selectedCoach);
      } catch (err: any) {
        setError(err.message || 'Google sign-in failed.');
      } finally {
        setPending(false);
      }
    };

    const renderGoogleButton = () => {
      if (cancelled || !container) return;
      const google = (window as any).google;
      if (!google?.accounts?.id) return;

      container.innerHTML = '';
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: { credential?: string }) => {
          void handleGoogleCredential(String(response?.credential || ''));
        },
        ux_mode: 'popup',
        auto_select: false,
        itp_support: true,
      });
      google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        logo_alignment: 'left',
        width: Math.max(container.clientWidth, 360),
      });
    };

    const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity="true"]');
    if ((window as any).google?.accounts?.id) {
      renderGoogleButton();
    } else if (existingScript) {
      existingScript.addEventListener('load', renderGoogleButton, { once: true });
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = 'true';
      script.addEventListener('load', renderGoogleButton, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      container.innerHTML = '';
    };
  }, [router]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!identifier.trim() || !password.trim()) {
      setError('Please enter your email or username and password.');
      return;
    }

    try {
      setPending(true);
      const auth = await login(identifier.trim(), password);
      setAuth(auth);
      routeAfterLogin(auth.selectedCoach);
    } catch (err: any) {
      setError(err.message || 'Login failed.');
    } finally {
      setPending(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (pending) return;
    if (!socialConsentAcceptedRef.current) {
      setSocialConsentWarning('Please confirm Terms and Privacy before continuing with Apple.');
      return;
    }
    if (!APPLE_CLIENT_ID) {
      setError('Apple sign-in is not configured for this app.');
      return;
    }

    try {
      setPending(true);
      setError('');
      await loadAppleSignInScript();

      const apple = (window as any).AppleID;
      if (!apple?.auth) {
        throw new Error('Apple sign-in could not be initialized.');
      }

      apple.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: 'name email',
        redirectURI: resolveAppleRedirectUri(),
        state: randomOAuthValue(),
        nonce: randomOAuthValue(),
        usePopup: true,
      });

      const response = await apple.auth.signIn();
      const identityToken = String(response?.authorization?.id_token || response?.authorization?.idToken || '').trim();
      if (!identityToken) {
        throw new Error('Apple sign-in did not return an identity token.');
      }

      const auth = await loginWithApple(identityToken, {
        fullName: appleFullNameFromResponse(response?.user?.name),
        healthDisclaimerAccepted: socialConsentAcceptedRef.current,
        consentVersion: HEALTH_DISCLAIMER_VERSION,
      });
      setAuth(auth);
      routeAfterLogin(auth.selectedCoach);
    } catch (err: any) {
      const appleError = String(err?.error || err?.message || '').trim();
      if (appleError && appleError !== 'popup_closed_by_user') {
        setError(appleError || 'Apple sign-in failed.');
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-white px-4 py-[clamp(1.25rem,3vh,2.5rem)] sm:px-6">
      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-clamp(2.5rem,6vh,5rem))] w-full max-w-[480px] flex-col justify-center gap-[clamp(1.25rem,3vh,2.25rem)]">
        <section className="rounded-[28px] border border-white/60 bg-white/70 p-[clamp(1.5rem,4vw,2.5rem)] text-sm text-[color:var(--ink-900)] shadow-[0_30px_80px_rgba(59,49,40,0.12)] backdrop-blur-2xl">
          <div className="mb-[clamp(1.5rem,3vh,2rem)] flex items-center justify-center gap-3">
            <div className="flex size-[clamp(3rem,6vw,3.5rem)] items-center justify-center rounded-2xl bg-white shadow-[0_18px_32px_rgba(105,121,247,0.12)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="ZYM logo" className="size-[clamp(2rem,4vw,2.5rem)] object-contain" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[color:var(--ink-900)]">ZYM</h1>
            </div>
          </div>

          <div className="mb-[clamp(1.5rem,3vh,2rem)] text-center">
            <h2 className="text-[1.625rem] font-semibold tracking-tight text-[color:var(--ink-900)] sm:text-[1.875rem]">Welcome Back</h2>
            <p className="mt-3 text-sm leading-6 text-[color:var(--ink-500)] sm:leading-7">
              Pick your AI coach, connect with friends, and manage training, nutrition, and daily habits in one premium community app.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4 sm:space-y-5">
            <div className="space-y-2">
              <label className="ml-1 text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Email Or Username</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[color:var(--ink-300)]">person</span>
                <input
                  className="w-full rounded-2xl border border-[rgba(171,164,155,0.22)] bg-white/55 py-3.5 pl-12 pr-4 text-sm text-[color:var(--ink-900)] outline-none transition focus:border-[rgba(105,121,247,0.32)] focus:ring-4 focus:ring-[rgba(105,121,247,0.12)] sm:py-4"
                  placeholder="your email or username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="ml-1 block text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Password</label>
                <button
                  type="button"
                  className="text-xs font-semibold text-[color:var(--coach-zj)] transition hover:underline"
                  onClick={() => router.push('/forgot-password')}
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[20px] text-[color:var(--ink-300)]">lock</span>
                <input
                  className="w-full rounded-2xl border border-[rgba(171,164,155,0.22)] bg-white/55 py-3.5 pl-12 pr-4 text-sm text-[color:var(--ink-900)] outline-none transition focus:border-[rgba(105,121,247,0.32)] focus:ring-4 focus:ring-[rgba(105,121,247,0.12)] sm:py-4"
                  placeholder="••••••••"
                  value={password}
                  type="password"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </div>

            {error ? <p className="text-sm text-[color:var(--danger)]">{error}</p> : null}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[color:var(--coach-lc)] to-[color:var(--coach-lc-strong)] px-4 py-4 text-sm font-bold text-white shadow-[0_18px_32px_rgba(177,99,34,0.22)] transition active:scale-[0.99]"
              disabled={pending}
            >
              {pending ? 'Signing in...' : 'Get to Work'}
              <span className="material-symbols-outlined text-base">arrow_forward</span>
            </button>

            {socialAuthAvailable ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-[rgba(171,164,155,0.16)]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">Or continue with Google or Apple</span>
                  <div className="h-px flex-1 bg-[rgba(171,164,155,0.16)]" />
                </div>
                <label className="flex items-start gap-3 rounded-2xl border border-[rgba(171,164,155,0.16)] bg-white/55 px-4 py-3 text-sm leading-6 text-[color:var(--ink-500)]">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 rounded border-slate-300"
                    checked={socialConsentAccepted}
                    onChange={(event) => setSocialConsentAccepted(event.target.checked)}
                  />
                  <span>
                    I understand the{' '}
                    <a href="https://zym8.com/terms.html" target="_blank" rel="noreferrer" className="font-semibold text-[color:var(--coach-zj)] transition hover:underline">
                      Terms
                    </a>
                    {' '}and{' '}
                    <a href="https://zym8.com/privacy.html" target="_blank" rel="noreferrer" className="font-semibold text-[color:var(--coach-zj)] transition hover:underline">
                      Privacy Policy
                    </a>
                    .
                  </span>
                </label>
                <div className="space-y-2.5">
                  {GOOGLE_CLIENT_ID ? (
                    <div
                      className={`relative flex min-h-[52px] w-full items-center justify-center overflow-hidden rounded-[18px] border border-[rgba(15,23,42,0.12)] bg-white px-4 text-[15px] font-semibold text-[color:var(--ink-900)] shadow-[0_10px_22px_rgba(15,23,42,0.04)] transition hover:border-[rgba(15,23,42,0.2)] hover:bg-white active:scale-[0.99] ${pending ? 'pointer-events-none opacity-70' : ''} ${!socialConsentAccepted ? 'saturate-[0.92]' : ''}`}
                    >
                      <div className="pointer-events-none relative z-0 flex items-center justify-center gap-4">
                        <GoogleMark />
                        <span>Continue with Google</span>
                      </div>
                      <div
                        ref={googleButtonRef}
                        aria-hidden="true"
                        className={`absolute inset-0 z-10 overflow-hidden rounded-[18px] ${socialConsentAccepted ? 'opacity-[0.01]' : 'pointer-events-none opacity-0'}`}
                      />
                      {!socialConsentAccepted ? (
                        <button
                          type="button"
                          className="absolute inset-0 z-20 cursor-not-allowed rounded-[18px]"
                          aria-label="Confirm Terms and Privacy before continuing with Google"
                          onClick={() => setSocialConsentWarning('Please confirm Terms and Privacy before continuing with Google.')}
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {APPLE_CLIENT_ID ? (
                    <button
                      type="button"
                      onClick={handleAppleSignIn}
                      disabled={pending}
                      className={`flex min-h-[52px] w-full items-center justify-center gap-4 rounded-[18px] border border-[rgba(15,23,42,0.12)] bg-white px-4 text-[15px] font-semibold text-[color:var(--ink-900)] shadow-[0_10px_22px_rgba(15,23,42,0.04)] transition hover:border-[rgba(15,23,42,0.2)] hover:bg-white active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70 ${!socialConsentAccepted ? 'saturate-[0.92]' : ''}`}
                    >
                      <span className="text-[24px] leading-none text-black"></span>
                      <span>Continue with Apple</span>
                    </button>
                  ) : null}
                </div>
                {socialConsentWarning ? (
                  <p className="text-xs font-medium text-[color:var(--danger)]">{socialConsentWarning}</p>
                ) : null}
              </div>
            ) : null}
          </form>

          <div className="mt-[clamp(1.5rem,3vh,2rem)] border-t border-[rgba(171,164,155,0.12)] pt-[clamp(1.5rem,3vh,2rem)] text-center">
            <p className="text-sm text-[color:var(--ink-500)]">
              New to the community?{' '}
              <button
                type="button"
                className="font-bold text-[color:var(--coach-zj)] transition hover:underline"
                onClick={() => router.push('/register')}
              >
                Register today
              </button>
            </p>
          </div>
        </section>

        <div className="flex justify-center gap-[clamp(1.25rem,4vw,2rem)] pb-1 opacity-60">
          {[
            { label: 'Coach ZJ', tone: 'bg-[rgba(105,121,247,0.12)] text-[color:var(--coach-zj)]' },
            { label: 'Coach LC', tone: 'bg-[rgba(242,138,58,0.12)] text-[color:var(--coach-lc)]' },
          ].map((coach) => (
            <div key={coach.label} className="flex flex-col items-center">
              <div className={`flex size-11 items-center justify-center rounded-full border border-white/70 sm:size-12 ${coach.tone}`}>
                <span className="material-symbols-outlined">fitness_center</span>
              </div>
              <span className="mt-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[color:var(--ink-300)]">{coach.label}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="grid min-h-dvh place-items-center px-5 py-8 text-sm text-[color:var(--ink-500)]">Loading...</main>}>
      <LoginScreen />
    </Suspense>
  );
}

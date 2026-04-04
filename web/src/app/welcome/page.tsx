'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from '@/lib/auth-storage';

export default function WelcomeRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace('/login');
      return;
    }
    router.replace('/app');
  }, [router]);

  return (
    <main className="grid min-h-dvh place-items-center px-5 py-8 text-sm text-[color:var(--ink-500)]">
      Redirecting to the app...
    </main>
  );
}

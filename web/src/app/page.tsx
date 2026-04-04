'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from '@/lib/auth-storage';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    if (!auth) {
      router.replace('/login');
      return;
    }
    router.replace('/app');
  }, [router]);

  return <div style={{ minHeight: '100vh' }} />;
}

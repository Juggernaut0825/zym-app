'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from '@/lib/auth-storage';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    router.replace(auth ? '/app' : '/login');
  }, [router]);

  return <div style={{ minHeight: '100vh' }} />;
}

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MessageRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/app?tab=messages');
  }, [router]);

  return null;
}

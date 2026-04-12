'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LeaderboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/app?tab=calendar');
  }, [router]);

  return null;
}

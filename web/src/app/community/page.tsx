'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CommunityRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/app?tab=community');
  }, [router]);

  return null;
}

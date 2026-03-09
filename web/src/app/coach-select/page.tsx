'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, setCoach } from '@/lib/auth-storage';
import { selectCoach } from '@/lib/api';

const cards = [
  {
    id: 'zj' as const,
    name: 'ZJ',
    title: 'Encouraging & thoughtful',
    desc: 'Best for long-term habit building. The tone is supportive and focused on sustainable progress.',
    highlight: '"Let’s complete the easiest win for today first."',
  },
  {
    id: 'lc' as const,
    name: 'LC',
    title: 'Strict & direct',
    desc: 'Best for users who want strict accountability and direct feedback with result-driven coaching.',
    highlight: '"No excuses. Finish today’s training first."',
  },
];

export default function CoachSelectPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    if (!auth) router.replace('/login');
  }, [router]);

  const handleSelect = async (coach: 'zj' | 'lc') => {
    const auth = getAuth();
    if (!auth) {
      router.replace('/login');
      return;
    }

    try {
      setError('');
      setLoading(true);
      await selectCoach(auth.userId, coach);
      setCoach(coach);
      router.push('/app');
    } catch (err: any) {
      setError(err.message || 'Failed to select coach.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', padding: '40px 20px' }}>
      <section style={{ maxWidth: 1040, margin: '0 auto' }}>
        <h1 className="zym-enter" style={{ fontSize: 56, lineHeight: 1.02 }}>Choose your coach</h1>
        <p className="zym-enter zym-delay-1" style={{ marginTop: 12, color: 'var(--ink-500)', fontSize: 18 }}>
          You can switch coach style anytime in Profile. Your selection takes you straight into the full community chat experience.
        </p>

        {error && <p style={{ marginTop: 12, color: 'var(--danger)' }}>{error}</p>}

        <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              className={`surface-card zym-enter zym-delay-${index + 1}`}
              onClick={() => handleSelect(card.id)}
              disabled={loading}
              style={{
                textAlign: 'left',
                padding: 22,
                cursor: 'pointer',
                borderRadius: 22,
                background: index === 0
                  ? 'linear-gradient(165deg, #ffffff, #f6fbf7)'
                  : 'linear-gradient(165deg, #ffffff, #f8f5f5)',
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'linear-gradient(135deg, #5f6e5f, #4d5b4d)',
                  color: '#fff',
                  fontWeight: 700,
                  fontFamily: 'var(--font-display)',
                }}
              >
                {card.name}
              </div>
              <h2 style={{ marginTop: 16, fontSize: 28 }}>{card.title}</h2>
              <p style={{ marginTop: 8, color: 'var(--ink-500)', lineHeight: 1.45 }}>{card.desc}</p>
              <p style={{ marginTop: 12, color: 'var(--sage-600)', fontWeight: 600 }}>{card.highlight}</p>
              <p style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-500)' }}>
                {loading ? 'Setting up coach...' : 'Tap to continue'}
              </p>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

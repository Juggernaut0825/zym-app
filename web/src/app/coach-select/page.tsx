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
    badge: 'Gentle encouragement',
    buttonClass: 'btn-zj',
    iconBackground: 'linear-gradient(135deg, var(--coach-zj), var(--coach-zj-strong))',
    cardBackground: 'linear-gradient(165deg, rgba(255,255,255,0.98), rgba(108,124,246,0.10))',
    borderColor: 'rgba(108,124,246,0.16)',
    accentColor: 'var(--coach-zj-ink)',
  },
  {
    id: 'lc' as const,
    name: 'LC',
    title: 'Strict & direct',
    desc: 'Best for users who want strict accountability and direct feedback with result-driven coaching.',
    highlight: '"No excuses. Finish today’s training first."',
    badge: 'Tough accountability',
    buttonClass: 'btn-lc',
    iconBackground: 'linear-gradient(135deg, var(--coach-lc), var(--coach-lc-strong))',
    cardBackground: 'linear-gradient(165deg, rgba(255,255,255,0.98), rgba(242,138,58,0.12))',
    borderColor: 'rgba(242,138,58,0.18)',
    accentColor: 'var(--coach-lc-ink)',
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
        <div
          className="zym-enter"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 999,
            border: '1px solid rgba(108,124,246,0.14)',
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--coach-zj)' }} />
          <span style={{ fontSize: 12, color: 'var(--ink-700)', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Two coaching personalities
          </span>
        </div>
        <h1 className="zym-enter" style={{ marginTop: 18, fontSize: 56, lineHeight: 1.02 }}>Choose your coach</h1>
        <p className="zym-enter zym-delay-1" style={{ marginTop: 12, color: 'var(--ink-500)', fontSize: 18, maxWidth: 720 }}>
          You can switch coach style anytime in Profile. Your selection takes you straight into the full community chat experience.
        </p>

        {error && <p style={{ marginTop: 12, color: 'var(--danger)' }}>{error}</p>}

        <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
          {cards.map((card, index) => (
            <div
              key={card.id}
              className={`surface-card zym-enter zym-delay-${index + 1}`}
              style={{
                padding: 24,
                borderRadius: 28,
                background: card.cardBackground,
                borderColor: card.borderColor,
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: `1px solid ${card.borderColor}`,
                  background: 'rgba(255,255,255,0.76)',
                  color: card.accentColor,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                {card.badge}
              </div>

              <div
                style={{
                  marginTop: 18,
                  width: 56,
                  height: 56,
                  borderRadius: 18,
                  display: 'grid',
                  placeItems: 'center',
                  background: card.iconBackground,
                  color: '#fff',
                  fontWeight: 700,
                  fontFamily: 'var(--font-display)',
                  boxShadow: card.id === 'lc' ? '0 14px 26px rgba(178,103,37,0.18)' : '0 14px 26px rgba(74,87,201,0.16)',
                }}
              >
                {card.name}
              </div>

              <h2 style={{ marginTop: 18, fontSize: 30 }}>{card.title}</h2>
              <p style={{ marginTop: 10, color: 'var(--ink-500)', lineHeight: 1.55 }}>{card.desc}</p>
              <p style={{ marginTop: 14, color: card.accentColor, fontWeight: 700, lineHeight: 1.5 }}>{card.highlight}</p>

              <button
                type="button"
                className={`btn ${card.buttonClass}`}
                onClick={() => handleSelect(card.id)}
                disabled={loading}
                style={{ marginTop: 18, width: '100%' }}
              >
                {loading ? 'Setting up coach...' : `Start with ${card.name}`}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

'use client';

export type CoachId = 'zj' | 'lc';
export type CoachAvatarState = 'idle' | 'talking' | 'selected' | 'celebrate';
export type CoachAvatarVariant = 'profile' | 'hero';
export type CoachAnimationMode = 'static' | 'loop';
export type CoachBubbleTone = 'soft' | 'strong';
export type CoachBubbleAlignment = 'left' | 'right' | 'center';
export type CoachBubbleTailDirection = 'left' | 'right' | 'top-left' | 'top-right' | 'none';

interface CoachArtConfig {
  id: CoachId;
  name: string;
  heroSrc: string;
  avatarSrc?: string;
  iconSrc?: string;
  animation?: {
    mp4?: string;
    lottie?: string;
    rive?: string;
  };
  faceCrop: {
    faceCenterX: number;
    faceCenterY: number;
    zoom: number;
  };
}

export const COACH_ART: Record<CoachId, CoachArtConfig> = {
  zj: {
    id: 'zj',
    name: 'ZJ',
    heroSrc: '/coaches/zj-hero.svg',
    faceCrop: {
      faceCenterX: 50,
      faceCenterY: 38,
      zoom: 2.08,
    },
  },
  lc: {
    id: 'lc',
    name: 'LC',
    heroSrc: '/coaches/lc-hero.svg',
    faceCrop: {
      faceCenterX: 50,
      faceCenterY: 38,
      zoom: 2.08,
    },
  },
};

interface CoachSpeechBubbleProps {
  text: string;
  coach: CoachId;
  tone?: CoachBubbleTone;
  alignment?: CoachBubbleAlignment;
  tailDirection?: CoachBubbleTailDirection;
  className?: string;
}

interface CoachAvatarProps {
  coach: CoachId;
  variant?: CoachAvatarVariant;
  animated?: boolean;
  state?: CoachAvatarState;
  size?: number;
  className?: string;
  ariaLabel?: string;
  bubbleText?: string;
  showBubble?: boolean;
}

interface CoachHeroProps {
  coach: CoachId;
  animationMode?: CoachAnimationMode;
  state?: CoachAvatarState;
  size?: number;
  showBubble?: boolean;
  bubbleText?: string;
  bubbleTone?: CoachBubbleTone;
  bubbleAlignment?: CoachBubbleAlignment;
  tailDirection?: CoachBubbleTailDirection;
  className?: string;
}

export function CoachSpeechBubble({
  text,
  coach,
  tone = 'soft',
  alignment = 'left',
  tailDirection = 'left',
  className = '',
}: CoachSpeechBubbleProps) {
  if (!text) return null;

  return (
    <div
      className={[
        'coach-speech-bubble',
        `coach-speech-bubble-${coach}`,
        `coach-speech-bubble-${tone}`,
        `coach-speech-bubble-align-${alignment}`,
        `coach-speech-bubble-tail-${tailDirection}`,
        className,
      ].filter(Boolean).join(' ')}
    >
      {text}
    </div>
  );
}

export function CoachAvatar({
  coach,
  variant = 'profile',
  animated = true,
  state = 'idle',
  size = 88,
  className = '',
  ariaLabel,
  bubbleText = '',
  showBubble = false,
}: CoachAvatarProps) {
  const art = COACH_ART[coach];
  const imageSrc = art.avatarSrc || art.heroSrc;
  const crop = art.faceCrop;

  if (variant === 'hero') {
    return (
      <div
        className={[
          'coach-hero-figure',
          `coach-hero-figure-${coach}`,
          `coach-hero-figure-${state}`,
          animated ? 'coach-hero-figure-animated' : '',
          className,
        ].filter(Boolean).join(' ')}
        style={{ ['--coach-hero-size' as string]: `${size}px` }}
        aria-label={ariaLabel || `${art.name} coach illustration`}
      >
        <img src={art.heroSrc} alt="" draggable={false} />
      </div>
    );
  }

  return (
    <span
      className={[
        'coach-avatar-wrap',
        showBubble ? 'coach-avatar-wrap-with-bubble' : '',
        className,
      ].filter(Boolean).join(' ')}
      style={{ ['--coach-avatar-size' as string]: `${size}px` }}
    >
      <span
        className={[
          'coach-avatar',
          `coach-avatar-${coach}`,
          `coach-avatar-${state}`,
          animated ? 'coach-avatar-animated' : '',
        ].filter(Boolean).join(' ')}
        aria-label={ariaLabel || `${art.name} coach avatar`}
      >
        <span
          className="coach-avatar-crop"
          style={{
            backgroundImage: `url(${imageSrc})`,
            backgroundPosition: `${crop.faceCenterX}% ${crop.faceCenterY}%`,
            backgroundSize: `${crop.zoom * 100}%`,
          }}
        />
      </span>
      {showBubble && bubbleText ? (
        <CoachSpeechBubble
          text={bubbleText}
          coach={coach}
          tailDirection="top-left"
          className="coach-avatar-inline-bubble"
        />
      ) : null}
    </span>
  );
}

export function CoachHero({
  coach,
  animationMode = 'loop',
  state = 'idle',
  size = 260,
  showBubble = false,
  bubbleText = '',
  bubbleTone = 'soft',
  bubbleAlignment = 'left',
  tailDirection = 'left',
  className = '',
}: CoachHeroProps) {
  const art = COACH_ART[coach];

  return (
    <div
      className={[
        'coach-hero',
        `coach-hero-${coach}`,
        `coach-hero-${state}`,
        animationMode === 'loop' ? 'coach-hero-loop' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <CoachAvatar
        coach={coach}
        variant="hero"
        animated={animationMode === 'loop'}
        state={state}
        size={size}
        ariaLabel={`${art.name} coach upper-body illustration`}
      />
      {showBubble && bubbleText ? (
        <CoachSpeechBubble
          text={bubbleText}
          coach={coach}
          tone={bubbleTone}
          alignment={bubbleAlignment}
          tailDirection={tailDirection}
        />
      ) : null}
    </div>
  );
}

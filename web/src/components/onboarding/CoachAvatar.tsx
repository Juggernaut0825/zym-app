'use client';

export type CoachId = 'zj' | 'lc';
export type CoachAvatarState = 'idle' | 'talking' | 'selected' | 'celebrate';

interface CoachAvatarProps {
  coach: CoachId;
  state?: CoachAvatarState;
  size?: number;
  bubbleText?: string;
  showBubble?: boolean;
  className?: string;
}

export function CoachAvatar({
  coach,
  state = 'idle',
  size = 88,
  bubbleText = '',
  showBubble = false,
  className = '',
}: CoachAvatarProps) {
  const label = coach.toUpperCase();

  return (
    <div
      className={`coach-avatar-wrap ${showBubble ? 'coach-avatar-wrap-with-bubble' : ''} ${className}`.trim()}
      style={{ ['--coach-avatar-size' as string]: `${size}px` }}
    >
      <div className={`coach-avatar coach-avatar-${coach} coach-avatar-${state}`} aria-label={`${label} coach avatar`}>
        <div className="coach-avatar-orbit coach-avatar-orbit-one" />
        <div className="coach-avatar-orbit coach-avatar-orbit-two" />
        <div className="coach-avatar-face">
          <div className="coach-avatar-brow coach-avatar-brow-left" />
          <div className="coach-avatar-brow coach-avatar-brow-right" />
          <div className="coach-avatar-eye coach-avatar-eye-left" />
          <div className="coach-avatar-eye coach-avatar-eye-right" />
          <div className="coach-avatar-mouth" />
          <div className="coach-avatar-initials">{label}</div>
        </div>
      </div>
      {showBubble && bubbleText ? (
        <div className={`coach-avatar-bubble coach-avatar-bubble-${coach}`}>
          {bubbleText}
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { memo } from 'react';

export type ConversationTileType = 'coach' | 'dm' | 'group';

export interface ConversationTileItem {
  topic: string;
  name: string;
  type: ConversationTileType;
  subtitle: string;
  preview?: string;
  unreadCount?: number;
  mentionCount?: number;
  avatarUrl?: string | null;
  userId?: number;
  coachId?: 'zj' | 'lc';
}

interface ConversationTileProps {
  item: ConversationTileItem;
  active: boolean;
  onSelect: (topic: string) => void;
  onOpenProfile?: (userId: number) => void;
  resolveAssetUrl: (value: string) => string;
  displayNameFromTopic: (topic: string) => string;
  avatarInitial: (value: string) => string;
}

function ConversationTileComponent({
  item,
  active,
  onSelect,
  onOpenProfile,
  resolveAssetUrl,
  displayNameFromTopic,
  avatarInitial,
}: ConversationTileProps) {
  const name = item.name || displayNameFromTopic(item.topic);
  const unreadTotal = Number(item.unreadCount || 0) + Number(item.mentionCount || 0);
  const hasUnread = unreadTotal > 0;
  const coachId = item.coachId || (item.topic.startsWith('coach_lc_') ? 'lc' : 'zj');
  const badgeTone = 'bg-slate-100 text-slate-500';
  const avatarTone = item.type === 'coach'
    ? (coachId === 'lc' ? 'bg-[rgba(242,138,58,0.14)] text-[color:var(--coach-lc)]' : 'bg-[rgba(105,121,247,0.14)] text-[color:var(--coach-zj)]')
    : 'bg-[rgba(255,255,255,0.72)] text-slate-700';
  const activeTone = 'bg-[rgba(15,23,42,0.06)] shadow-[0_10px_24px_rgba(15,23,42,0.06)]';
  const badgeLabel = item.type === 'coach' ? 'COACH' : item.type.toUpperCase();
  const canOpenProfile = item.type === 'dm' && typeof item.userId === 'number' && item.userId > 0 && !!onOpenProfile;

  return (
    <button
      type="button"
      onClick={() => onSelect(item.topic)}
      className={`w-full rounded-[20px] px-3 py-2.5 text-left transition sm:rounded-[24px] sm:px-4 sm:py-3 ${
        active
          ? activeTone
          : 'bg-transparent hover:bg-white/55'
      }`}
    >
      <div className="flex items-center gap-3">
        {canOpenProfile ? (
          <button
            type="button"
            className="relative shrink-0 rounded-[14px] transition hover:scale-[1.02]"
            onClick={(event) => {
              event.stopPropagation();
              onOpenProfile?.(item.userId as number);
            }}
            aria-label={`Open ${name}'s profile`}
            title={`Open ${name}'s profile`}
          >
            {item.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveAssetUrl(item.avatarUrl)}
                alt={name}
                style={{ width: 36, height: 36, borderRadius: 14, objectFit: 'cover' }}
              />
            ) : (
              <div className={`flex size-9 items-center justify-center rounded-[13px] text-[13px] font-semibold sm:size-10 sm:rounded-[15px] sm:text-sm ${avatarTone}`}>
                {avatarInitial(name)}
              </div>
            )}
            {hasUnread ? (
              <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-[#ef4444] ring-2 ring-[rgba(255,255,255,0.85)] sm:size-3" aria-hidden="true" />
            ) : null}
          </button>
        ) : (
          <div className="relative shrink-0">
            {item.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveAssetUrl(item.avatarUrl)}
                alt={name}
                style={{ width: 36, height: 36, borderRadius: 14, objectFit: 'cover' }}
              />
            ) : (
              <div className={`flex size-9 items-center justify-center rounded-[13px] text-[13px] font-semibold sm:size-10 sm:rounded-[15px] sm:text-sm ${avatarTone}`}>
                {avatarInitial(name)}
              </div>
            )}
            {hasUnread ? (
              <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-[#ef4444] ring-2 ring-[rgba(255,255,255,0.85)] sm:size-3" aria-hidden="true" />
            ) : null}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2.5 sm:gap-3">
            <div className="min-w-0">
              <strong className={`block truncate text-[13px] sm:text-sm ${hasUnread ? 'font-extrabold text-slate-950' : 'text-slate-900'}`}>{name}</strong>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <span className={`rounded-full px-1.5 py-[3px] text-[9px] font-bold uppercase tracking-[0.16em] sm:px-2 sm:py-1 sm:text-[10px] sm:tracking-[0.18em] ${badgeTone}`}>
                {badgeLabel}
              </span>
              {hasUnread ? (
                <span className="inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white sm:min-h-5 sm:min-w-5 sm:text-[10px]">
                  {unreadTotal > 99 ? '99+' : unreadTotal}
                </span>
              ) : null}
            </div>
          </div>
          {item.preview ? (
            <p
              className={`mt-1 overflow-hidden text-[13px] leading-5 sm:mt-1.5 sm:text-sm sm:leading-6 ${hasUnread ? 'font-medium text-slate-700' : 'text-slate-600'}`}
              style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}
            >
              {item.preview}
            </p>
          ) : (
            <p className="mt-1 text-[13px] leading-5 text-slate-400 sm:mt-1.5 sm:text-sm sm:leading-6">No messages yet.</p>
          )}
        </div>
      </div>
    </button>
  );
}

export const ConversationTile = memo(ConversationTileComponent);

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
}

interface ConversationTileProps {
  item: ConversationTileItem;
  active: boolean;
  onSelect: (topic: string) => void;
  resolveAssetUrl: (value: string) => string;
  displayNameFromTopic: (topic: string) => string;
  avatarInitial: (value: string) => string;
}

function ConversationTileComponent({
  item,
  active,
  onSelect,
  resolveAssetUrl,
  displayNameFromTopic,
  avatarInitial,
}: ConversationTileProps) {
  const name = item.name || displayNameFromTopic(item.topic);
  const unreadTotal = Number(item.unreadCount || 0) + Number(item.mentionCount || 0);
  const hasUnread = unreadTotal > 0;
  const isLcCoach = item.type === 'coach' && name.toLowerCase().includes('lc');
  const badgeTone = item.type === 'coach'
    ? (isLcCoach ? 'bg-[rgba(242,138,58,0.12)] text-[color:var(--coach-lc)]' : 'bg-[rgba(105,121,247,0.12)] text-[color:var(--coach-zj)]')
    : 'bg-slate-100 text-slate-500';
  const avatarTone = item.type === 'coach'
    ? (isLcCoach ? 'bg-[rgba(242,138,58,0.14)] text-[color:var(--coach-lc)]' : 'bg-[rgba(105,121,247,0.14)] text-[color:var(--coach-zj)]')
    : 'bg-white text-slate-700';
  const activeTone = item.type === 'coach'
    ? (isLcCoach
      ? 'border-[rgba(242,138,58,0.26)] bg-[rgba(242,138,58,0.08)] shadow-[0_14px_30px_rgba(242,138,58,0.12)]'
      : 'border-[rgba(105,121,247,0.24)] bg-[rgba(105,121,247,0.08)] shadow-[0_14px_30px_rgba(105,121,247,0.12)]')
    : 'border-slate-200/80 bg-white/75 shadow-[0_12px_28px_rgba(71,60,49,0.06)]';
  const badgeLabel = item.type === 'coach' ? 'COACH' : item.type.toUpperCase();
  return (
    <button
      type="button"
      onClick={() => onSelect(item.topic)}
      className={`w-full rounded-[22px] border px-4 py-3 text-left transition ${
        active
          ? activeTone
          : 'border-white/70 bg-white/55 hover:bg-white/70'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          {item.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveAssetUrl(item.avatarUrl)}
              alt={name}
              style={{ width: 40, height: 40, borderRadius: 15, objectFit: 'cover', border: '1px solid rgba(221, 216, 207, 0.88)' }}
            />
          ) : (
            <div className={`flex size-10 items-center justify-center rounded-[14px] border border-white/70 text-sm font-semibold ${avatarTone}`}>
              {avatarInitial(name)}
            </div>
          )}
          {hasUnread ? (
            <span className="absolute -right-1 -top-1 size-3 rounded-full bg-[#ef4444] ring-2 ring-white" aria-hidden="true" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <strong className={`block truncate text-sm ${hasUnread ? 'font-extrabold text-slate-950' : 'text-slate-900'}`}>{name}</strong>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${badgeTone}`}>
                {badgeLabel}
              </span>
              {hasUnread ? (
                <span className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold text-white">
                  {unreadTotal > 99 ? '99+' : unreadTotal}
                </span>
              ) : null}
            </div>
          </div>
          {item.preview ? (
            <p
              className={`mt-1.5 overflow-hidden text-sm leading-6 ${hasUnread ? 'font-medium text-slate-700' : 'text-slate-600'}`}
              style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}
            >
              {item.preview}
            </p>
          ) : (
            <p className="mt-1.5 text-sm leading-6 text-slate-400">No messages yet.</p>
          )}
        </div>
      </div>
    </button>
  );
}

export const ConversationTile = memo(ConversationTileComponent);

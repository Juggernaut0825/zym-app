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
  return (
    <button
      type="button"
      onClick={() => onSelect(item.topic)}
      className={`conversation-tile ${active ? 'active' : ''}`}
    >
      <div className="conversation-tile-head">
        {item.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveAssetUrl(item.avatarUrl)}
            alt={name}
            style={{ width: 36, height: 36, borderRadius: 12, objectFit: 'cover', border: '1px solid var(--line)' }}
          />
        ) : (
          <div className={`conversation-avatar ${item.type}`}>
            {avatarInitial(name)}
          </div>
        )}
        <strong className="conversation-tile-name">{name}</strong>
        <div className="conversation-tile-meta">
          <span className={`conversation-type-pill ${item.type}`}>{item.type.toUpperCase()}</span>
          {Number(item.mentionCount || 0) > 0 ? (
            <span className="conversation-unread-badge mention">{item.mentionCount}</span>
          ) : null}
          {Number(item.unreadCount || 0) > 0 ? (
            <span className="conversation-unread-badge">{item.unreadCount}</span>
          ) : null}
        </div>
      </div>
      <p className="conversation-tile-subtitle">{item.subtitle}</p>
      {item.preview ? <p className="conversation-tile-preview">{item.preview}</p> : null}
    </button>
  );
}

export const ConversationTile = memo(ConversationTileComponent);

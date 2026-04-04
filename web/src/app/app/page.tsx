'use client';

import { ChangeEvent, Dispatch, FormEvent, SetStateAction, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  acceptFriend,
  addFriend,
  addGroupMember,
  createGroup,
  createPostComment,
  createPost,
  deletePost,
  deleteAccount,
  createAbuseReport,
  getAuthSessions,
  getAbuseReports,
  getFeed,
  getFriendConnectCode,
  getFriendRequests,
  getFriends,
  getHealthMomentum,
  getGroupMembers,
  getInbox,
  getLeaderboard,
  getMentionNotifications,
  getSecurityEvents,
  getMessages,
  getPostComments,
  getPublicProfile,
  getProfile,
  getUserPublic,
  logoutSession,
  markMentionNotificationsRead,
  markMessagesRead,
  openDM,
  logoutAllSessions,
  revokeAuthSession,
  reactToPost,
  removeGroupMember,
  resolveFriendConnectCode,
  searchUsers,
  selectCoach,
  sendMessage,
  syncHealth,
  updatePostVisibility,
  updateProfile,
  uploadFile,
} from '@/lib/api';
import { resolveApiAssetUrl } from '@/lib/config';
import { clearAuth, getAuth, setCoach } from '@/lib/auth-storage';
import { RealtimeClient } from '@/lib/realtime';
import { ConversationTile } from '@/components/chat/ConversationTile';
import { CoachWorkspacePanel, type CoachWorkspaceMode } from '@/components/chat/CoachWorkspacePanel';
import { MediaPreviewGrid } from '@/components/media/MediaPreviewGrid';
import {
  AppSocketEvent,
  ChatMessage,
  AuthSession,
  AbuseReport,
  FeedComment,
  FeedPost,
  Friend,
  GroupMember,
  HealthMomentumResponse,
  LeaderboardEntry,
  MentionNotification,
  SecurityEvent,
  PublicProfileResponse,
  PublicUser,
  Profile,
  UserSummary,
} from '@/lib/types';

const APP_TITLE = 'ZYM Community Coach';
const COACH_SAFETY_TOOLTIP = 'ZYM AI Coach is not medical advice.\nIf you have injuries, medical conditions, chest pain, severe pain, dizziness, or urgent symptoms, stop and seek professional or emergency care.';
const BASE_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><defs><linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f28a3a"/><stop offset="50%" stop-color="#e17734"/><stop offset="100%" stop-color="#6c7cf6"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="2" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="60" cy="60" r="55" fill="#0a0a0a" stroke="url(#logoGradient)" stroke-width="3"/><path d="M30 35 L90 35 L90 45 L50 75 L90 75 L90 85 L30 85 L30 75 L70 45 L30 45 Z" fill="url(#logoGradient)" filter="url(#glow)"/><path d="M75 30 L85 50 L78 50 L85 70 L75 50 L82 50 Z" fill="#fbbf24" opacity="0.9"/><circle cx="25" cy="60" r="3" fill="#f28a3a" opacity="0.65"/><circle cx="95" cy="60" r="3" fill="#6c7cf6" opacity="0.65"/><circle cx="60" cy="60" r="45" fill="none" stroke="#f28a3a" stroke-width="1" opacity="0.28"/><circle cx="60" cy="60" r="50" fill="none" stroke="#6c7cf6" stroke-width="0.5" opacity="0.22"/></svg>`;

const tabs = [
  { key: 'messages', label: 'Message', icon: 'chat_bubble' },
  { key: 'community', label: 'Community', icon: 'groups' },
  { key: 'leaderboard', label: 'Leaderboard', icon: 'emoji_events' },
  { key: 'profile', label: 'Profile', icon: 'person' },
] as const;

const visibleTabs = tabs.filter((item) => item.key !== 'leaderboard');

type VisibleTabKey = (typeof tabs)[number]['key'];
type TabKey = VisibleTabKey | 'friends';
type TabIcon = (typeof tabs)[number]['icon'];
type CoachId = 'zj' | 'lc';
type CoachPanelMode = 'chat' | CoachWorkspaceMode;

type ConversationType = 'coach' | 'dm' | 'group';
interface Conversation {
  topic: string;
  name: string;
  type: ConversationType;
  subtitle: string;
  preview?: string;
  unreadCount?: number;
  mentionCount?: number;
  avatarUrl?: string | null;
  userId?: number;
  groupId?: number;
  coachEnabled?: string;
}

interface ProfileViewerState {
  open: boolean;
  loading: boolean;
  type: 'coach' | 'user';
  coachId?: 'zj' | 'lc';
  userId?: number;
  data?: PublicProfileResponse | null;
}

interface AbuseReportDraft {
  open: boolean;
  targetType: 'user' | 'post' | 'message' | 'group';
  targetId: number | null;
  reason: string;
  details: string;
  title: string;
  pending: boolean;
}

interface PostActionDialogState {
  open: boolean;
  mode: 'delete' | 'visibility';
  post: FeedPost | null;
  pending: boolean;
}

const MAX_MEDIA_ATTACHMENTS = 6;
const MAX_MEDIA_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_PROFILE_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_PROFILE_BACKGROUND_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const GROUP_MEMBER_LIMIT = 500;
const mediaFallbackExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.mp4', '.mov', '.webm', '.m4v'];
const MESSAGE_DRAFTS_STORAGE_KEY_PREFIX = 'zym.web.messageDrafts.v2.user';
const POST_DRAFT_STORAGE_KEY_PREFIX = 'zym.web.postDraft.v2.user';

function isSupportedMediaFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/')) {
    return true;
  }
  const lowerName = file.name.toLowerCase();
  return mediaFallbackExtensions.some((ext) => lowerName.endsWith(ext));
}

function isHeicLikeFile(file: File): boolean {
  const mime = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return mime.includes('heic')
    || mime.includes('heif')
    || name.endsWith('.heic')
    || name.endsWith('.heif');
}

function mergeMediaFiles(existing: File[], incoming: File[]): { files: File[]; errors: string[] } {
  const next: File[] = [...existing];
  const seen = new Set(existing.map((file) => `${file.name}::${file.size}::${file.lastModified}`));
  const errors: string[] = [];

  for (const file of incoming) {
    const fingerprint = `${file.name}::${file.size}::${file.lastModified}`;
    if (seen.has(fingerprint)) continue;

    if (!isSupportedMediaFile(file)) {
      errors.push(`Unsupported file format: ${file.name}`);
      continue;
    }

    if (file.size > MAX_MEDIA_FILE_SIZE_BYTES) {
      errors.push(`${file.name} is too large. Max size is 50MB.`);
      continue;
    }

    if (next.length >= MAX_MEDIA_ATTACHMENTS) {
      errors.push(`You can attach up to ${MAX_MEDIA_ATTACHMENTS} files at once.`);
      break;
    }

    seen.add(fingerprint);
    next.push(file);
  }

  return { files: next, errors };
}

function formatTime(iso?: string | null): string {
  const date = parseDisplayDate(iso);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatSessionDate(iso?: string | null): string {
  const date = parseDisplayDate(iso);
  if (!date) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function eventLabel(eventType: string): string {
  const text = String(eventType || '').trim().toLowerCase();
  if (!text) return 'Security event';
  return text
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDayLabel(iso?: string | null): string {
  const date = parseDisplayDate(iso);
  if (!date) return '';

  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date();
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const yesterday = new Date(normalizedToday);
  yesterday.setDate(normalizedToday.getDate() - 1);

  if (normalized.getTime() === normalizedToday.getTime()) return 'Today';
  if (normalized.getTime() === yesterday.getTime()) return 'Yesterday';

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function displayNameFromTopic(topic: string): string {
  if (topic.startsWith('grp_')) return 'Group';
  if (topic.startsWith('coach_')) return 'Coach';
  return 'DM';
}

function normalizeCoachId(value: unknown): CoachId | null {
  return value === 'lc' || value === 'zj' ? value : null;
}

function coachButtonClass(coachId?: CoachId | null): string {
  if (coachId === 'lc') return 'btn btn-lc';
  if (coachId === 'zj') return 'btn btn-zj';
  return 'btn btn-ghost';
}

function groupCoachSubtitle(coachEnabled?: string): string {
  if (coachEnabled === 'lc') return 'Group · LC coach';
  if (coachEnabled === 'zj') return 'Group · ZJ coach';
  return 'Group · No AI';
}

function resolveConversationCoachId(
  conversation: Conversation | undefined,
  selectedCoach: CoachId,
): CoachId {
  if (!conversation) return selectedCoach;
  if (conversation.type === 'group') {
    return normalizeCoachId(conversation.coachEnabled) || selectedCoach;
  }
  if (conversation.type === 'coach') {
    return conversation.topic.startsWith('coach_lc_') ? 'lc' : 'zj';
  }
  return selectedCoach;
}

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.webm') || lower.includes('.m4v');
}

function toEmbeddableVideoUrl(raw: string): string {
  const value = String(raw || '').trim();
  if (!value) return '';

  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes('youtu.be')) {
      const videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
      return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0` : '';
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        const videoId = String(parsed.searchParams.get('v') || '').trim();
        return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0` : '';
      }
      const parts = parsed.pathname.split('/').filter(Boolean);
      const shortsIndex = parts.indexOf('shorts');
      if (shortsIndex >= 0 && parts[shortsIndex + 1]) {
        return `https://www.youtube.com/embed/${parts[shortsIndex + 1]}?autoplay=1&rel=0`;
      }
      const embedIndex = parts.indexOf('embed');
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return `https://www.youtube.com/embed/${parts[embedIndex + 1]}?autoplay=1&rel=0`;
      }
    }
    if (parsed.hostname.includes('vimeo.com')) {
      const videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
      return videoId ? `https://player.vimeo.com/video/${videoId}?autoplay=1` : '';
    }
  } catch {
    return '';
  }

  return '';
}

function messageDraftsStorageKey(userId: number): string {
  return `${MESSAGE_DRAFTS_STORAGE_KEY_PREFIX}.${userId}`;
}

function postDraftStorageKey(userId: number): string {
  return `${POST_DRAFT_STORAGE_KEY_PREFIX}.${userId}`;
}

function loadMessageDrafts(userId: number): Record<string, string> {
  if (typeof window === 'undefined') return {};
  if (!Number.isInteger(userId) || userId <= 0) return {};
  try {
    const raw = localStorage.getItem(messageDraftsStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const next: Record<string, string> = {};
    Object.entries(parsed).forEach(([topic, value]) => {
      if (typeof value === 'string' && value.trim()) {
        next[topic] = value.slice(0, 2000);
      }
    });
    return next;
  } catch {
    return {};
  }
}

function persistMessageDrafts(userId: number, drafts: Record<string, string>) {
  if (typeof window === 'undefined') return;
  if (!Number.isInteger(userId) || userId <= 0) return;
  try {
    const compact = Object.entries(drafts).reduce<Record<string, string>>((acc, [topic, value]) => {
      const normalized = String(value || '').slice(0, 2000);
      if (normalized.trim()) {
        acc[topic] = normalized;
      }
      return acc;
    }, {});
    const key = messageDraftsStorageKey(userId);
    if (Object.keys(compact).length === 0) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(compact));
  } catch {
    // Ignore storage failures in private mode.
  }
}

function loadPostDraft(userId: number): string {
  if (typeof window === 'undefined') return '';
  if (!Number.isInteger(userId) || userId <= 0) return '';
  try {
    return String(localStorage.getItem(postDraftStorageKey(userId)) || '').slice(0, 6000);
  } catch {
    return '';
  }
}

function persistPostDraft(userId: number, value: string) {
  if (typeof window === 'undefined') return;
  if (!Number.isInteger(userId) || userId <= 0) return;
  try {
    const normalized = String(value || '').slice(0, 6000);
    const key = postDraftStorageKey(userId);
    if (normalized.trim()) {
      localStorage.setItem(key, normalized);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures in private mode.
  }
}

function buildP2PTopic(userA: number, userB: number): string {
  const left = Math.min(userA, userB);
  const right = Math.max(userA, userB);
  return `p2p_${left}_${right}`;
}

function parseFriendIdentifier(input: string): number | null {
  const value = input.trim();
  if (!value) return null;

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  try {
    const url = new URL(value);
    const byUid = Number(url.searchParams.get('uid') || '');
    const byUserId = Number(url.searchParams.get('userId') || '');
    if (Number.isInteger(byUid) && byUid > 0) return byUid;
    if (Number.isInteger(byUserId) && byUserId > 0) return byUserId;
  } catch {
    // Ignore URL parse failure and fallback to regex.
  }

  const byRegex = value.match(/(?:uid|userId)\s*[:=]\s*(\d+)/i)?.[1]
    || value.match(/add-friend[:/](\d+)/i)?.[1];
  if (!byRegex) return null;

  const parsed = Number(byRegex);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isPotentialConnectCode(input: string): boolean {
  const value = input.trim();
  if (!value) return false;

  if (/^\d{6,8}$/.test(value)) return true;
  if (/connectId\s*[:=]\s*\d{6,8}/i.test(value)) return true;
  if (/token\s*[:=]\s*[A-Za-z0-9_\-.]+/i.test(value)) return true;

  try {
    const url = new URL(value);
    return Boolean(url.searchParams.get('connectId') || url.searchParams.get('token'));
  } catch {
    return false;
  }
}

function coachDisplayName(coach: 'zj' | 'lc'): string {
  return coach === 'lc' ? 'LC Coach' : 'ZJ Coach';
}

function buildCoachTopic(userId: number, coach: 'zj' | 'lc'): string {
  return coach === 'lc' ? `coach_lc_${userId}` : `coach_${userId}`;
}

function createClientMessageId(): string {
  return `web_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function coachTheme(coach: 'zj' | 'lc') {
  if (coach === 'lc') {
    return {
      toneClass: 'coach-lc',
      gradient: 'linear-gradient(135deg, var(--coach-lc), var(--coach-lc-strong))',
      softBackground: 'linear-gradient(165deg, rgba(255,255,255,0.98), rgba(242,138,58,0.10))',
      borderColor: 'rgba(242,138,58,0.18)',
      ink: 'var(--coach-lc-ink)',
      description: 'Strict coaching style with direct accountability. Best for users who want hard feedback and action-first guidance.',
    };
  }

  return {
    toneClass: 'coach-zj',
    gradient: 'linear-gradient(135deg, var(--coach-zj), var(--coach-zj-strong))',
    softBackground: 'linear-gradient(165deg, rgba(255,255,255,0.98), rgba(108,124,246,0.10))',
    borderColor: 'rgba(108,124,246,0.16)',
    ink: 'var(--coach-zj-ink)',
    description: 'Encouraging coaching style focused on consistency, progressive habits, and sustainable fitness routines.',
  };
}

function avatarInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Z';
  const lower = trimmed.toLowerCase();
  if (lower.includes('lc coach') || lower === 'lc') return 'LC';
  if (lower.includes('zj coach') || lower === 'zj') return 'ZJ';
  return trimmed.charAt(0).toUpperCase();
}

function splitReplySegments(content?: string | null): string[] {
  const text = String(content || '').trim();
  if (!text) return [];
  const parts = text
    .split(/\n{2,}/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text];
}

function appendTextNodes(target: ReactNode[], text: string, keyPrefix: string) {
  const lines = text.split('\n');
  lines.forEach((line, lineIndex) => {
    if (line) {
      target.push(<span key={`${keyPrefix}-text-${lineIndex}`}>{line}</span>);
    }
    if (lineIndex < lines.length - 1) {
      target.push(<br key={`${keyPrefix}-break-${lineIndex}`} />);
    }
  });
}

function renderMessageInlineLinks(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      appendTextNodes(nodes, text.slice(lastIndex, match.index), `seg-${lastIndex}`);
    }
    const url = match[2] || match[3] || '';
    const label = match[1] || url;
    nodes.push(
      <a
        key={`link-${match.index}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="font-semibold underline underline-offset-2"
      >
        {label}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    appendTextNodes(nodes, text.slice(lastIndex), `tail-${lastIndex}`);
  }

  return nodes.length > 0 ? nodes : [text];
}

function buildFaviconHref(unreadCount: number): string {
  if (unreadCount <= 0) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BASE_FAVICON_SVG)}`;
  }

  const badge = unreadCount > 99 ? '99+' : String(unreadCount);
  const svg = BASE_FAVICON_SVG.replace(
    '</svg>',
    `<circle cx="92" cy="28" r="20" fill="#dc2626" stroke="#ffffff" stroke-width="4"/><text x="92" y="34" text-anchor="middle" font-family="Arial, sans-serif" font-size="${badge.length > 2 ? 14 : 18}" font-weight="700" fill="#ffffff">${badge}</text></svg>`,
  );
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function parseDisplayDate(value?: string | null): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)
      ? `${raw}Z`
      : raw;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function detectLocalTimezone(): string {
  try {
    return String(Intl.DateTimeFormat().resolvedOptions().timeZone || '').trim();
  } catch {
    return '';
  }
}

function TabGlyph({ icon, active }: { icon: TabIcon; active: boolean }) {
  return (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{
        fontSize: 24,
        fontVariationSettings: `'FILL' ${active ? 1 : 0}, 'wght' 500, 'GRAD' 0, 'opsz' 24`,
      }}
    >
      {icon}
    </span>
  );
}

function normalizeTabKey(value: string | null): TabKey {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'message' || raw === 'messages' || raw === 'chat') return 'messages';
  if (raw === 'community' || raw === 'feed' || raw === 'friends') return 'community';
  if (raw === 'leaderboard') return 'leaderboard';
  if (raw === 'profile') return 'profile';
  return 'messages';
}

export default function AppPage() {
  const router = useRouter();
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const activeTopicRef = useRef<string>('');
  const authUserIdRef = useRef<number>(0);
  const authStorageSyncTriggeredRef = useRef(false);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatStreamRef = useRef<HTMLDivElement | null>(null);
  const coachMenuRef = useRef<HTMLDivElement | null>(null);
  const composerMenuRef = useRef<HTMLDivElement | null>(null);
  const conversationSearchRef = useRef<HTMLInputElement | null>(null);
  const messageDraftsRef = useRef<Record<string, string>>({});
  const messagesRef = useRef<ChatMessage[]>([]);
  const coachReplyRevealTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const coachReplyRevealQueuesRef = useRef<Record<string, ChatMessage[]>>({});
  const coachReplyRevealActiveMessageRef = useRef<Record<string, string | null>>({});
  const skipTypingPulseRef = useRef(false);
  const notificationAudioContextRef = useRef<AudioContext | null>(null);
  const lastNotificationKeyRef = useRef<string>('');

  const [ready, setReady] = useState(false);
  const [showAppIntro, setShowAppIntro] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [authUserId, setAuthUserId] = useState<number>(0);
  const [authUsername, setAuthUsername] = useState('');
  const [selectedCoach, setSelectedCoach] = useState<'zj' | 'lc'>('zj');

  const [tab, setTab] = useState<TabKey>('messages');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationQuery, setConversationQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [animatedCoachReplies, setAnimatedCoachReplies] = useState<Record<string, number>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<Array<{ url: string; isVideo: boolean; name: string }>>([]);
  const [composerActionsOpen, setComposerActionsOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);
  const [coachPanelMode, setCoachPanelMode] = useState<CoachPanelMode>('chat');
  const [coachMenuOpen, setCoachMenuOpen] = useState(false);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [requests, setRequests] = useState<Friend[]>([]);
  const [friendQuery, setFriendQuery] = useState('');
  const [friendSearchResult, setFriendSearchResult] = useState<UserSummary[]>([]);
  const [friendIdInput, setFriendIdInput] = useState('');
  const [friendByIdPreview, setFriendByIdPreview] = useState<PublicUser | null>(null);
  const [friendByIdPending, setFriendByIdPending] = useState(false);
  const [friendByIdError, setFriendByIdError] = useState('');
  const [connectId, setConnectId] = useState('');
  const [connectCode, setConnectCode] = useState('');
  const [connectExpiresAt, setConnectExpiresAt] = useState('');
  const [connectQrDataUrl, setConnectQrDataUrl] = useState('');
  const [connectScanError, setConnectScanError] = useState('');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupPending, setCreateGroupPending] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupCoachEnabled, setGroupCoachEnabled] = useState<'none' | 'zj' | 'lc'>('zj');
  const [groupInviteQuery, setGroupInviteQuery] = useState('');
  const [groupInvitees, setGroupInvitees] = useState<UserSummary[]>([]);
  const [groupInviteSuggestions, setGroupInviteSuggestions] = useState<UserSummary[]>([]);
  const [groupInviteSuggestionsPending, setGroupInviteSuggestionsPending] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [activeGroupMembers, setActiveGroupMembers] = useState<GroupMember[]>([]);
  const [activeGroupInviteQuery, setActiveGroupInviteQuery] = useState('');
  const [activeGroupInviteSuggestions, setActiveGroupInviteSuggestions] = useState<UserSummary[]>([]);
  const [activeGroupInviteSuggestionsPending, setActiveGroupInviteSuggestionsPending] = useState(false);
  const [activeGroupMembersPending, setActiveGroupMembersPending] = useState(false);
  const [activeGroupInvitePending, setActiveGroupInvitePending] = useState(false);
  const [activeGroupRemovePendingId, setActiveGroupRemovePendingId] = useState<number | null>(null);

  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [communityQuery, setCommunityQuery] = useState('');
  const [postText, setPostText] = useState('');
  const [postVisibility, setPostVisibility] = useState<'public' | 'friends'>('friends');
  const [postFiles, setPostFiles] = useState<File[]>([]);
  const [postFilePreviews, setPostFilePreviews] = useState<Array<{ url: string; isVideo: boolean; name: string }>>([]);
  const [postPending, setPostPending] = useState(false);
  const [expandedPostIds, setExpandedPostIds] = useState<number[]>([]);
  const [postMenuOpenId, setPostMenuOpenId] = useState<number | null>(null);
  const [postActionDialog, setPostActionDialog] = useState<PostActionDialogState>({
    open: false,
    mode: 'delete',
    post: null,
    pending: false,
  });
  const [postCommentsById, setPostCommentsById] = useState<Record<number, FeedComment[]>>({});
  const [expandedCommentPostIds, setExpandedCommentPostIds] = useState<number[]>([]);
  const [commentDraftByPostId, setCommentDraftByPostId] = useState<Record<number, string>>({});
  const [commentLoadingPostIds, setCommentLoadingPostIds] = useState<number[]>([]);
  const [commentPendingPostId, setCommentPendingPostId] = useState<number | null>(null);
  const [mentionNotifications, setMentionNotifications] = useState<MentionNotification[]>([]);
  const [mentionsLoading, setMentionsLoading] = useState(false);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [healthMomentum, setHealthMomentum] = useState<HealthMomentumResponse | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardQuery, setLeaderboardQuery] = useState('');
  const [leaderboardMetric, setLeaderboardMetric] = useState<'steps' | 'calories'>('steps');
  const [healthSync, setHealthSync] = useState({ steps: '0', calories: '0' });
  const [syncPending, setSyncPending] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileDraft, setProfileDraft] = useState({ bio: '', fitness_goal: '', hobbies: '', avatar_url: '', background_url: '' });
  const [profilePending, setProfilePending] = useState(false);
  const [profileAvatarUploading, setProfileAvatarUploading] = useState(false);
  const [profileBackgroundUploading, setProfileBackgroundUploading] = useState(false);
  const [authSessions, setAuthSessions] = useState<AuthSession[]>([]);
  const [authSessionsLoading, setAuthSessionsLoading] = useState(false);
  const [authSessionPendingId, setAuthSessionPendingId] = useState<string | null>(null);
  const [logoutAllSessionsPending, setLogoutAllSessionsPending] = useState(false);
  const [deleteAccountPending, setDeleteAccountPending] = useState(false);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [securityEventsLoading, setSecurityEventsLoading] = useState(false);
  const [abuseReports, setAbuseReports] = useState<AbuseReport[]>([]);
  const [abuseReportsLoading, setAbuseReportsLoading] = useState(false);
  const [abuseReportDraft, setAbuseReportDraft] = useState<AbuseReportDraft>({
    open: false,
    targetType: 'user',
    targetId: null,
    reason: '',
    details: '',
    title: 'Report content',
    pending: false,
  });
  const [profileViewer, setProfileViewer] = useState<ProfileViewerState>({
    open: false,
    loading: false,
    type: 'coach',
    coachId: 'zj',
    data: null,
  });
  const [mediaLightbox, setMediaLightbox] = useState<{
    open: boolean;
    url: string;
    isVideo: boolean;
    embedUrl: string;
    label: string;
  }>({
    open: false,
    url: '',
    isVideo: false,
    embedUrl: '',
    label: 'Media',
  });

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const reauthTriggeredRef = useRef(false);
  const friendsRef = useRef<Friend[]>([]);
  const selectedCoachRef = useRef<'zj' | 'lc'>('zj');
  const postMenuRef = useRef<HTMLDivElement | null>(null);

  const typingTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.topic === activeTopic),
    [conversations, activeTopic],
  );

  const activeGroupMyRole = useMemo(
    () => activeGroupMembers.find((member) => member.id === authUserId)?.role || null,
    [activeGroupMembers, authUserId],
  );

  const conversationCounts = useMemo(
    () => conversations.reduce(
      (acc, conversation) => {
        acc[conversation.type] += 1;
        return acc;
      },
      { coach: 0, dm: 0, group: 0 },
    ),
    [conversations],
  );

  const filteredConversations = useMemo(() => {
    const query = conversationQuery.trim().toLowerCase();
    return conversations.filter((conversation) => {
      if (!query) return true;

      const haystack = [
        conversation.name,
        conversation.subtitle,
        conversation.preview,
        conversation.topic,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [conversationQuery, conversations]);

  const unreadMentionCount = useMemo(
    () => mentionNotifications.filter((item) => !item.is_read).length,
    [mentionNotifications],
  );

  const filteredFeed = useMemo(() => {
    const query = communityQuery.trim().toLowerCase();
    if (!query) return feed;
    return feed.filter((post) => {
      const haystack = [post.username, post.type, post.content].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [communityQuery, feed]);

  useEffect(() => {
    if (postMenuOpenId === null) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!postMenuRef.current?.contains(event.target as Node)) {
        setPostMenuOpenId(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPostMenuOpenId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [postMenuOpenId]);

  const filteredLeaderboard = useMemo(() => {
    const query = leaderboardQuery.trim().toLowerCase();
    if (!query) return leaderboard;
    return leaderboard.filter((entry) => entry.username.toLowerCase().includes(query));
  }, [leaderboard, leaderboardQuery]);

  const hasInlineCoachReveal = useMemo(
    () => Object.keys(animatedCoachReplies).length > 0,
    [animatedCoachReplies],
  );

  const typingLabel = useMemo(() => {
    const ids = Object.entries(typingUsers)
      .filter(([, value]) => value)
      .map(([userId]) => userId)
      .filter((userId) => userId !== String(authUserId))
      .filter((userId) => !hasInlineCoachReveal || (userId !== 'coach' && userId !== '0'));

    if (ids.length === 0) return '';

    const names = Array.from(
      new Set(
        ids.map((userId) => {
          if (userId === 'coach' || userId === '0') {
            if (activeConversation?.type === 'coach') {
              return activeConversation.name.toLowerCase().includes('lc') ? 'LC' : 'ZJ';
            }
            return selectedCoach.toUpperCase();
          }
          const numericId = Number(userId);
          if (!Number.isFinite(numericId)) return 'Someone';
          const groupName = activeGroupMembers.find((member) => member.id === numericId)?.username;
          if (groupName) return groupName;
          const messageName = [...messages].reverse().find((message) => message.from_user_id === numericId)?.username;
          return messageName || 'Someone';
        }),
      ),
    );

    if (names.length === 1) return `${names[0]} is typing...`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
    return `${names[0]} and ${names.length - 1} others are typing...`;
  }, [typingUsers, authUserId, activeConversation, activeGroupMembers, messages, selectedCoach, hasInlineCoachReveal]);

  const connectCodeMeta = useMemo(() => {
    if (!connectExpiresAt) return 'Secure code rotates every 2 minutes.';
    return `Secure code rotates every 2 minutes · valid until ${formatTime(connectExpiresAt)}.`;
  }, [connectExpiresAt]);

  const totalUnreadCount = useMemo(
    () => conversations.reduce((sum, item) => sum + Number(item.unreadCount || 0) + Number(item.mentionCount || 0), 0),
    [conversations],
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.title = totalUnreadCount > 0 ? `(${Math.min(totalUnreadCount, 99)}) ${APP_TITLE}` : APP_TITLE;

    let iconLink = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!iconLink) {
      iconLink = document.createElement('link');
      iconLink.rel = 'icon';
      document.head.appendChild(iconLink);
    }
    iconLink.href = buildFaviconHref(totalUnreadCount);
  }, [totalUnreadCount]);

  useEffect(() => {
    if (!createGroupOpen && !groupSettingsOpen && !deleteAccountDialogOpen && !abuseReportDraft.open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setCreateGroupOpen(false);
      setGroupSettingsOpen(false);
      setDeleteAccountDialogOpen(false);
      setAbuseReportDraft((prev) => ({ ...prev, open: false, pending: false }));
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [createGroupOpen, groupSettingsOpen, deleteAccountDialogOpen, abuseReportDraft.open]);

  const panelMomentum = useMemo(() => {
    if (tab === 'messages') {
      return {
        kicker: 'Daily Momentum',
        title: 'Keep your coaching loop active',
        subtitle: 'Jump between DM, groups, and coach threads without context loss.',
        stats: [
          { label: 'Live chats', value: String(conversations.length) },
          { label: 'Unread', value: String(totalUnreadCount) },
          { label: 'Mentions', value: String(unreadMentionCount) },
        ],
      };
    }

    if (tab === 'community') {
      const totalLikes = feed.reduce((sum, post) => sum + Number(post.reaction_count || 0), 0);
      const totalComments = feed.reduce((sum, post) => sum + Number(post.comment_count || 0), 0);
      return {
        kicker: 'Community Pulse',
        title: 'Post progress, capture momentum',
        subtitle: 'Share workouts and meals so your circle can react in real-time.',
        stats: [
          { label: 'Posts', value: String(feed.length) },
          { label: 'Likes', value: String(totalLikes) },
          { label: 'Comments', value: String(totalComments) },
        ],
      };
    }

    if (tab === 'friends') {
      return {
        kicker: 'Connection Graph',
        title: 'Build your accountability network',
        subtitle: 'Add friends, accept requests, and spin up focused groups fast.',
        stats: [
          { label: 'Friends', value: String(friends.length) },
          { label: 'Requests', value: String(requests.length) },
          { label: 'Groups', value: String(conversationCounts.group) },
        ],
      };
    }

    if (tab === 'leaderboard') {
      const topName = leaderboard[0]?.username || '-';
      const topScore = leaderboard[0] ? String((leaderboard[0].steps || 0) + (leaderboard[0].calories_burned || 0)) : '0';
      return {
        kicker: 'Performance Board',
        title: 'Climb your weekly ranking',
        subtitle: 'Sync daily movement and keep pressure on your training circle.',
        stats: [
          { label: 'Athletes', value: String(leaderboard.length) },
          { label: '#1', value: topName },
          { label: 'Top score', value: topScore },
        ],
      };
    }

    return {
      kicker: 'Identity + Security',
      title: 'Own your profile footprint',
      subtitle: 'Tune coach style, profile presence, and active sessions in one place.',
      stats: [
        { label: 'Coach', value: selectedCoach.toUpperCase() },
        { label: 'Sessions', value: String(authSessions.length) },
        { label: 'Security', value: String(securityEvents.length) },
      ],
    };
  }, [
    tab,
    conversations,
    totalUnreadCount,
    unreadMentionCount,
    feed,
    friends.length,
    requests.length,
    conversationCounts.group,
    leaderboard,
    selectedCoach,
    authSessions.length,
    securityEvents.length,
    abuseReports.length,
  ]);

  const openMediaLightbox = (url: string, label = 'Media') => {
    const resolved = resolveApiAssetUrl(url);
    if (!resolved) return;
    const embedUrl = toEmbeddableVideoUrl(resolved);
    setMediaLightbox({
      open: true,
      url: resolved,
      isVideo: Boolean(embedUrl) || isVideoUrl(resolved),
      embedUrl,
      label,
    });
  };

  const closeMediaLightbox = () => {
    setMediaLightbox((prev) => ({ ...prev, open: false }));
  };

  const showNotice = (message: string) => {
    if (noticeTimeoutRef.current) {
      clearTimeout(noticeTimeoutRef.current);
    }
    setNotice(message);
    noticeTimeoutRef.current = setTimeout(() => {
      setNotice('');
      noticeTimeoutRef.current = null;
    }, 2400);
  };

  const forceReauth = (message = 'Session expired. Please sign in again.') => {
    if (reauthTriggeredRef.current) return;
    reauthTriggeredRef.current = true;
    setError(message);
    clearCoachReplyRevealQueue();
    setAnimatedCoachReplies({});
    clearAuth();
    realtimeRef.current?.disconnect();
    router.replace('/login');
  };

  const syncAppToStoredAuth = (message = 'Session changed in another tab. Reloading...') => {
    if (authStorageSyncTriggeredRef.current) return;
    authStorageSyncTriggeredRef.current = true;
    clearCoachReplyRevealQueue();
    setAnimatedCoachReplies({});
    realtimeRef.current?.disconnect();

    const auth = getAuth();
    if (typeof window === 'undefined') return;
    if (!auth) {
      clearAuth();
      window.location.replace('/login');
      return;
    }

    setNotice(message);
      window.location.replace(auth.selectedCoach ? '/app' : '/welcome');
  };

  const scrollChatToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const container = chatStreamRef.current;
        if (!container) return;
        container.scrollTo({ top: container.scrollHeight, behavior });
      });
    });
  };

  const coachRevealQueueKeyFor = (topic: string, ownerUserId: number) => {
    if (!topic || !Number.isInteger(ownerUserId) || ownerUserId <= 0) return '';
    return `${ownerUserId}:${topic}`;
  };

  const activeCoachRevealQueueKey = () => coachRevealQueueKeyFor(activeTopicRef.current, authUserIdRef.current);

  const clearCoachReplyRevealQueue = (queueKey?: string) => {
    const keys = queueKey
      ? [queueKey]
      : Array.from(new Set([
        ...Object.keys(coachReplyRevealTimersRef.current),
        ...Object.keys(coachReplyRevealQueuesRef.current),
        ...Object.keys(coachReplyRevealActiveMessageRef.current),
      ]));

    keys.forEach((key) => {
      coachReplyRevealTimersRef.current[key]?.forEach((timer) => clearTimeout(timer));
      delete coachReplyRevealTimersRef.current[key];
      delete coachReplyRevealQueuesRef.current[key];
      delete coachReplyRevealActiveMessageRef.current[key];
    });

    if (!queueKey || queueKey === activeCoachRevealQueueKey()) {
      setTypingUsers((prev) => ({
        ...prev,
        coach: false,
        '0': false,
      }));
    }
  };

  const segmentRevealDelay = (segment: string, segmentIndex: number) => {
    const characterCount = segment.replace(/\s+/g, ' ').trim().length;
    const baseDelay = segmentIndex === 0 ? 680 : 900;
    return Math.min(3200, Math.max(baseDelay, baseDelay + characterCount * 18));
  };

  const runCoachReplyRevealQueue = (queueKey: string) => {
    if (!queueKey || coachReplyRevealActiveMessageRef.current[queueKey]) return;

    const queue = coachReplyRevealQueuesRef.current[queueKey] || [];
    const message = queue[0];
    if (!message) {
      clearCoachReplyRevealQueue(queueKey);
      return;
    }

    const messageId = String(message.id);
    const segments = splitReplySegments(message.content);
    if (segments.length === 0) {
      coachReplyRevealQueuesRef.current[queueKey] = queue.slice(1);
      setAnimatedCoachReplies((prev) => {
        if (!(messageId in prev)) return prev;
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      if (coachReplyRevealQueuesRef.current[queueKey]?.length) {
        runCoachReplyRevealQueue(queueKey);
      } else {
        clearCoachReplyRevealQueue(queueKey);
      }
      return;
    }

    coachReplyRevealActiveMessageRef.current[queueKey] = messageId;
    setAnimatedCoachReplies((prev) => ({ ...prev, [messageId]: 0 }));
    if (queueKey === activeCoachRevealQueueKey()) {
      setTypingUsers((prev) => ({
        ...prev,
        coach: true,
        '0': true,
      }));
      scrollChatToBottom('smooth');
    }

    const revealSegment = (segmentIndex: number) => {
      const timer = setTimeout(() => {
        const isCurrentQueue = queueKey === coachRevealQueueKeyFor(message.topic, authUserIdRef.current);
        const activeMessageId = coachReplyRevealActiveMessageRef.current[queueKey];
        if (!isCurrentQueue || activeMessageId !== messageId) {
          clearCoachReplyRevealQueue(queueKey);
          setAnimatedCoachReplies((prev) => {
            if (!(messageId in prev)) return prev;
            const next = { ...prev };
            delete next[messageId];
            return next;
          });
          return;
        }

        setAnimatedCoachReplies((prev) => ({ ...prev, [messageId]: segmentIndex + 1 }));
        if (queueKey === activeCoachRevealQueueKey()) {
          scrollChatToBottom('smooth');
        }

        if (segmentIndex + 1 < segments.length) {
          revealSegment(segmentIndex + 1);
          return;
        }

        const settleTimer = setTimeout(() => {
          setAnimatedCoachReplies((prev) => {
            if (!(messageId in prev)) return prev;
            const next = { ...prev };
            delete next[messageId];
            return next;
          });
          coachReplyRevealQueuesRef.current[queueKey] = (coachReplyRevealQueuesRef.current[queueKey] || [])
            .filter((item) => String(item.id) !== messageId);
          delete coachReplyRevealActiveMessageRef.current[queueKey];
          coachReplyRevealTimersRef.current[queueKey]?.forEach((queuedTimer) => clearTimeout(queuedTimer));
          delete coachReplyRevealTimersRef.current[queueKey];

          if ((coachReplyRevealQueuesRef.current[queueKey] || []).length > 0) {
            runCoachReplyRevealQueue(queueKey);
            return;
          }

          clearCoachReplyRevealQueue(queueKey);
        }, 260);

        coachReplyRevealTimersRef.current[queueKey] = [
          ...(coachReplyRevealTimersRef.current[queueKey] || []),
          settleTimer,
        ];
      }, segmentRevealDelay(segments[segmentIndex], segmentIndex));

      coachReplyRevealTimersRef.current[queueKey] = [
        ...(coachReplyRevealTimersRef.current[queueKey] || []),
        timer,
      ];
    };

    revealSegment(0);
  };

  const enqueueCoachReplyReveal = (message: ChatMessage) => {
    if (!message.is_coach) return;

    const queueKey = coachRevealQueueKeyFor(message.topic, authUserIdRef.current);
    if (!queueKey) return;

    const messageId = String(message.id);
    const activeMessageId = coachReplyRevealActiveMessageRef.current[queueKey];
    const queuedMessages = coachReplyRevealQueuesRef.current[queueKey] || [];
    if (activeMessageId === messageId || queuedMessages.some((item) => String(item.id) === messageId)) {
      return;
    }

    coachReplyRevealQueuesRef.current[queueKey] = [...queuedMessages, message];
    runCoachReplyRevealQueue(queueKey);
  };

  const playBackgroundNotificationTone = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (document.visibilityState !== 'hidden') return;

    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const audioContext = notificationAudioContextRef.current || new AudioCtx();
      notificationAudioContextRef.current = audioContext;

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.06, audioContext.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.18);
    } catch {
      // Ignore notification audio failures.
    }
  };

  const upsertActiveTopicMessage = (message: ChatMessage, clientMessageId?: string | null): boolean => {
    if (!message || activeTopicRef.current !== message.topic) {
      return false;
    }

    const normalizedClientMessageId = String(clientMessageId || message.client_message_id || '').trim();
    const normalizedMessage: ChatMessage = {
      ...message,
      client_message_id: normalizedClientMessageId || message.client_message_id || null,
    };

    const existingIndex = messagesRef.current.findIndex((item) => (
      item.id === normalizedMessage.id
      || (normalizedClientMessageId && item.client_message_id === normalizedClientMessageId)
    ));

    let inserted = false;
    let nextMessages = messagesRef.current.slice();

    if (existingIndex >= 0) {
      nextMessages[existingIndex] = normalizedMessage;
    } else {
      inserted = true;
      nextMessages = [...nextMessages, normalizedMessage];
    }

    nextMessages.sort((left, right) => {
      const leftTime = Date.parse(left.created_at || '') || 0;
      const rightTime = Date.parse(right.created_at || '') || 0;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return Number(left.id) - Number(right.id);
    });

    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    return inserted;
  };

  const handleSocketEvent = (event: AppSocketEvent | { type: string; [key: string]: unknown }) => {
    if (event.type === 'auth_failed') {
      forceReauth('Invalid or expired token.');
      return;
    }

    if (event.type === 'error') {
      const text = String(event.message || '').toLowerCase();
      if (text.includes('not authenticated') || text.includes('invalid') || text.includes('expired')) {
        forceReauth('Invalid or expired token.');
        return;
      }
    }

    if (event.type === 'message_created') {
      const topic = String(event.topic);
      const message = event.message as ChatMessage;
      const clientMessageId = String(event.clientMessageId || message.client_message_id || '').trim() || null;
      const isActiveTopic = topic === activeTopicRef.current;
      const isCoachMessage = Number(message.from_user_id) === 0;
      const fromCurrentUser = Number(message.from_user_id) === authUserIdRef.current;
      const notificationKey = `${message.id}:${message.created_at}`;
      const nextPreview = String(message.content || '').trim() || (Array.isArray(message.media_urls) && message.media_urls.length > 0 ? 'Sent an attachment' : 'New message');

      if (!isActiveTopic && !fromCurrentUser && lastNotificationKeyRef.current !== notificationKey) {
        lastNotificationKeyRef.current = notificationKey;
        playBackgroundNotificationTone();
      }

      setConversations((prev) => prev.map((conversation) => {
        if (conversation.topic !== topic) return conversation;
        const existingUnread = Number(conversation.unreadCount || 0);
        const unreadCount = !fromCurrentUser && !isActiveTopic
          ? existingUnread + 1
          : (isActiveTopic ? 0 : existingUnread);
        return {
          ...conversation,
          preview: nextPreview,
          unreadCount,
        };
      }));

      if (isActiveTopic) {
        const inserted = upsertActiveTopicMessage(message, clientMessageId);

        if (authUserIdRef.current > 0) {
          void markMessagesRead({
            userId: authUserIdRef.current,
            topic,
            messageId: Number(message.id),
          }).catch(() => undefined);
        }

        if (isCoachMessage && inserted) {
          enqueueCoachReplyReveal(message);
        } else if (inserted || fromCurrentUser) {
          scrollChatToBottom('smooth');
        }
      }

      void loadInbox(authUserIdRef.current, selectedCoachRef.current, friendsRef.current);
      void loadMentions(authUserIdRef.current);
      return;
    }

    if (event.type === 'typing') {
      const topic = String(event.topic || '');
      if (topic !== activeTopicRef.current) return;

      const userId = String(event.userId || '');
      if (userId === String(authUserIdRef.current)) return;
      const isTyping = Boolean(event.isTyping);
      if (!isTyping && (userId === 'coach' || userId === '0') && Object.keys(coachReplyRevealTimersRef.current).length > 0) {
        return;
      }
      setTypingUsers((prev) => ({ ...prev, [userId]: isTyping }));
      if (typingTimeoutRef.current[userId]) {
        clearTimeout(typingTimeoutRef.current[userId]);
        delete typingTimeoutRef.current[userId];
      }
      if (isTyping && userId !== 'coach' && userId !== '0') {
        typingTimeoutRef.current[userId] = setTimeout(() => {
          setTypingUsers((prev) => ({ ...prev, [userId]: false }));
          delete typingTimeoutRef.current[userId];
        }, 4500);
      }
      return;
    }

    if (event.type === 'inbox_updated') {
      void loadInbox(authUserIdRef.current, selectedCoachRef.current, friendsRef.current);
      return;
    }

    if (event.type === 'friends_updated') {
      void loadFriendsData(authUserIdRef.current)
        .then((rows) => loadInbox(authUserIdRef.current, selectedCoachRef.current, rows))
        .catch(() => undefined);
    }
  };

  const bootstrap = async () => {
    const auth = getAuth();
    if (!auth) {
      router.replace('/login');
      return;
    }
    if (!auth.selectedCoach) {
      router.replace('/welcome');
      return;
    }

    setAuthUserId(auth.userId);
    setAuthUsername(auth.username);
    setSelectedCoach(auth.selectedCoach);
    selectedCoachRef.current = auth.selectedCoach;
    const bootstrapCoachName = coachDisplayName(auth.selectedCoach);
    const defaultCoachTopic = buildCoachTopic(auth.userId, auth.selectedCoach);
    messageDraftsRef.current = loadMessageDrafts(auth.userId);
    setConversations([
      {
        topic: defaultCoachTopic,
        name: bootstrapCoachName,
        type: 'coach',
        subtitle: 'AI Coach',
        avatarUrl: null,
        userId: 0,
      },
    ]);
    setActiveTopic(defaultCoachTopic);
    setComposer(messageDraftsRef.current[defaultCoachTopic] || '');
    setPostText(loadPostDraft(auth.userId));

    const params = new URLSearchParams(window.location.search);
    setTab(normalizeTabKey(params.get('tab')));

    const client = new RealtimeClient();
    client.connect(auth.token);
    client.onEvent(handleSocketEvent);
    realtimeRef.current = client;

    setReady(true);

    const initialFriends = await loadFriendsData(auth.userId);
    await Promise.all([
      loadInbox(auth.userId, auth.selectedCoach, initialFriends),
      loadFeed(auth.userId),
      loadLeaderboard(auth.userId),
      loadProfile(auth.userId),
      loadAuthSessions(),
      loadSecurityEvents(auth.userId),
      loadAbuseReports(auth.userId),
      loadConnectInfo(auth.userId),
      loadMentions(auth.userId),
    ]);
  };

  useEffect(() => {
    void bootstrap();

    return () => {
      realtimeRef.current?.disconnect();
      realtimeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !authUserId) return;

    const syncTimezone = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const timezone = detectLocalTimezone();
      if (!timezone) return;
      void updateProfile({ userId: authUserId, timezone }).catch(() => {});
    };

    syncTimezone();
    window.addEventListener('focus', syncTimezone);
    document.addEventListener('visibilitychange', syncTimezone);
    return () => {
      window.removeEventListener('focus', syncTimezone);
      document.removeEventListener('visibilitychange', syncTimezone);
    };
  }, [ready, authUserId]);

  useEffect(() => {
    const onAuthExpired = () => forceReauth('Invalid or expired token.');
    window.addEventListener('zym-auth-expired', onAuthExpired as EventListener);
    return () => window.removeEventListener('zym-auth-expired', onAuthExpired as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const relevantAuthKeys = new Set(['token', 'refreshToken', 'userId', 'username', 'selectedCoach']);
    const checkStoredAuth = (message = 'Session changed in another tab. Reloading...') => {
      const currentUserId = authUserIdRef.current;
      if (!currentUserId) return;

      const auth = getAuth();
      if (!auth) {
        forceReauth('Signed out in another tab.');
        return;
      }

      if (auth.userId !== currentUserId || auth.selectedCoach !== selectedCoachRef.current) {
        syncAppToStoredAuth(message);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key && !relevantAuthKeys.has(event.key)) return;
      checkStoredAuth('Account changed in another tab. Reloading...');
    };

    const onFocus = () => checkStoredAuth('Session changed. Reloading...');
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkStoredAuth('Session changed. Reloading...');
      }
    };

    const onScopeMismatch = () => {
      checkStoredAuth('Session changed in another tab. Reloading...');
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    window.addEventListener('zym-auth-scope-mismatch', onScopeMismatch as EventListener);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('zym-auth-scope-mismatch', onScopeMismatch as EventListener);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onAuthRefreshed = (event: Event) => {
      const detail = (event as CustomEvent<{ token?: string }>).detail;
      const token = String(detail?.token || '').trim();
      if (!token) return;
      realtimeRef.current?.updateToken(token);
    };
    window.addEventListener('zym-auth-refreshed', onAuthRefreshed as EventListener);
    return () => window.removeEventListener('zym-auth-refreshed', onAuthRefreshed as EventListener);
  }, []);

  useEffect(() => {
    const syncOnline = () => setIsOnline(window.navigator.onLine);
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, []);

  useEffect(() => {
    activeTopicRef.current = activeTopic;
    clearCoachReplyRevealQueue();
    setAnimatedCoachReplies({});
    if (!activeTopic) return;

    void loadMessagesForTopic(activeTopic);
    setTypingUsers({});
    setComposerActionsOpen(false);
    skipTypingPulseRef.current = true;
    setComposer(messageDraftsRef.current[activeTopic] || '');
    Object.values(typingTimeoutRef.current).forEach((timer) => clearTimeout(timer));
    typingTimeoutRef.current = {};
    realtimeRef.current?.subscribe(activeTopic);
  }, [activeTopic]);

  useEffect(() => {
    authUserIdRef.current = authUserId;
    clearCoachReplyRevealQueue();
    setAnimatedCoachReplies({});
    setTypingUsers({});
    messagesRef.current = [];
    setMessages([]);
    const scopedDrafts = loadMessageDrafts(authUserId);
    messageDraftsRef.current = scopedDrafts;
    setPostText(loadPostDraft(authUserId));
    if (activeTopicRef.current) {
      skipTypingPulseRef.current = true;
      setComposer(scopedDrafts[activeTopicRef.current] || '');
    }
  }, [authUserId]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  useEffect(() => {
    selectedCoachRef.current = selectedCoach;
  }, [selectedCoach]);

  useEffect(() => {
    if (!activeConversation || activeConversation.type !== 'group' || !activeConversation.groupId) {
      setActiveGroupMembers([]);
      setActiveGroupInviteQuery('');
      setActiveGroupInviteSuggestions([]);
      setGroupSettingsOpen(false);
      return;
    }
    void loadActiveGroupMembers(activeConversation.groupId);
  }, [activeConversation?.topic]);

  useEffect(() => {
    setCoachMenuOpen(false);
    if (!activeConversation || activeConversation.type !== 'coach') {
      setCoachPanelMode('chat');
      return;
    }
    setCoachPanelMode('chat');
  }, [activeConversation?.topic]);

  useEffect(() => {
    if (coachPanelMode === 'chat') return;
    setComposerActionsOpen(false);
  }, [coachPanelMode]);

  useEffect(() => {
    if (!activeTopic) return;
    if (activeConversation?.type === 'coach' && coachPanelMode !== 'chat') {
      realtimeRef.current?.typing(activeTopic, false);
      return;
    }
    if (skipTypingPulseRef.current) {
      skipTypingPulseRef.current = false;
      return;
    }
    const shouldTyping = composer.trim().length > 0;
    realtimeRef.current?.typing(activeTopic, shouldTyping);

    return () => {
      realtimeRef.current?.typing(activeTopic, false);
    };
  }, [composer, activeTopic, activeConversation?.type, coachPanelMode]);

  useEffect(() => {
    return () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current);
      }
      clearCoachReplyRevealQueue();
      Object.values(typingTimeoutRef.current).forEach((timer) => clearTimeout(timer));
      typingTimeoutRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 5600);
    return () => clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setShowAppIntro(false), 900);
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const normalizedTab = tab === 'friends' ? 'community' : tab;
    const url = new URL(window.location.href);
    url.searchParams.set('tab', normalizedTab);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [ready, tab]);

  useEffect(() => {
    if (!ready || !authUserId || tab !== 'friends') return;
    const interval = setInterval(() => {
      void loadConnectInfo(authUserId);
    }, 110_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authUserId, tab]);

  useEffect(() => {
    if (!ready || !authUserId || tab !== 'messages') return;
    void loadMentions(authUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authUserId, tab]);

  useEffect(() => {
    if (!ready || !authUserId || tab !== 'profile') return;
    void loadAuthSessions();
    void loadSecurityEvents(authUserId);
    void loadAbuseReports(authUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authUserId, tab]);

  useEffect(() => {
    if (!mediaLightbox.open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMediaLightbox();
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaLightbox.open]);

  useEffect(() => {
    if (!composerActionsOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!composerMenuRef.current?.contains(target)) {
        setComposerActionsOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setComposerActionsOpen(false);
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [composerActionsOpen]);

  useEffect(() => {
    if (!coachMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!coachMenuRef.current?.contains(target)) {
        setCoachMenuOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCoachMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [coachMenuOpen]);

  useEffect(() => {
    const onHotkey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (tab !== 'messages') return;
        event.preventDefault();
        conversationSearchRef.current?.focus();
      }
    };

    window.addEventListener('keydown', onHotkey);
    return () => window.removeEventListener('keydown', onHotkey);
  }, [tab]);

  useEffect(() => {
    const previews = attachments.map((file) => ({
      url: URL.createObjectURL(file),
      isVideo: file.type.startsWith('video/') || isVideoUrl(file.name),
      name: file.name,
    }));
    setAttachmentPreviews(previews);

    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [attachments]);

  useEffect(() => {
    const previews = postFiles.map((file) => ({
      url: URL.createObjectURL(file),
      isVideo: file.type.startsWith('video/') || isVideoUrl(file.name),
      name: file.name,
    }));
    setPostFilePreviews(previews);

    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [postFiles]);

  useEffect(() => {
    if (!activeTopic) return;
    const next = { ...messageDraftsRef.current };
    if (composer.trim()) {
      next[activeTopic] = composer.slice(0, 2000);
    } else {
      delete next[activeTopic];
    }
    messageDraftsRef.current = next;
    persistMessageDrafts(authUserId, next);
  }, [composer, activeTopic, authUserId]);

  useEffect(() => {
    persistPostDraft(authUserId, postText);
  }, [postText, authUserId]);

  useEffect(() => {
    if (!friendQuery.trim()) {
      setFriendSearchResult([]);
      return;
    }

    const timer = setTimeout(() => {
      void searchUsers(friendQuery.trim())
        .then((result) => setFriendSearchResult(result.filter((item) => item.id !== authUserId)))
        .catch(() => setFriendSearchResult([]));
    }, 280);

    return () => clearTimeout(timer);
  }, [friendQuery, authUserId]);

  useEffect(() => {
    const query = groupInviteQuery.trim();
    const excludedIds = new Set([authUserId, ...groupInvitees.map((item) => item.id)]);
    if (!query) {
      setGroupInviteSuggestions([]);
      setGroupInviteSuggestionsPending(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setGroupInviteSuggestionsPending(true);
      void searchUsers(query)
        .then((result) => {
          if (cancelled) return;
          setGroupInviteSuggestions(result.filter((item) => !excludedIds.has(item.id)));
        })
        .catch(() => {
          if (!cancelled) setGroupInviteSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setGroupInviteSuggestionsPending(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [groupInviteQuery, groupInvitees, authUserId]);

  useEffect(() => {
    const query = activeGroupInviteQuery.trim();
    const excludedIds = new Set(activeGroupMembers.map((item) => item.id));
    excludedIds.add(authUserId);
    if (!query) {
      setActiveGroupInviteSuggestions([]);
      setActiveGroupInviteSuggestionsPending(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setActiveGroupInviteSuggestionsPending(true);
      void searchUsers(query)
        .then((result) => {
          if (cancelled) return;
          setActiveGroupInviteSuggestions(result.filter((item) => !excludedIds.has(item.id)));
        })
        .catch(() => {
          if (!cancelled) setActiveGroupInviteSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setActiveGroupInviteSuggestionsPending(false);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeGroupInviteQuery, activeGroupMembers, authUserId]);

  useEffect(() => {
    const raw = friendIdInput.trim();
    if (!raw) {
      setFriendByIdPreview(null);
      setFriendByIdError('');
      return;
    }

    const connectLike = isPotentialConnectCode(raw);
    if (connectLike) {
      setFriendByIdError('');
      const timer = setTimeout(() => {
        void (async () => {
          try {
            setFriendByIdPending(true);
            const resolved = await resolveFriendConnectCode(raw);
            const user = await getUserPublic(resolved.userId);
            setFriendByIdPreview(user);
            if (Number(user.id) === authUserId) {
              setFriendByIdError('This is your own account.');
            }
          } catch (err: any) {
            setFriendByIdPreview(null);
            setFriendByIdError(err.message || 'Connect code not found.');
          } finally {
            setFriendByIdPending(false);
          }
        })();
      }, 220);

      return () => clearTimeout(timer);
    }

    const parsedId = parseFriendIdentifier(raw);
    if (!parsedId || parsedId <= 0) {
      setFriendByIdPreview(null);
      setFriendByIdError('Invalid ID / connect code.');
      return;
    }
    if (parsedId === authUserId) {
      setFriendByIdPreview(null);
      setFriendByIdError('This is your own account.');
      return;
    }

    setFriendByIdError('');
    const timer = setTimeout(() => {
      void (async () => {
        try {
          setFriendByIdPending(true);
          const user = await getUserPublic(parsedId);
          setFriendByIdPreview(user);
        } catch (err: any) {
          setFriendByIdPreview(null);
          setFriendByIdError(err.message || 'User not found.');
        } finally {
          setFriendByIdPending(false);
        }
      })();
    }, 220);

    return () => clearTimeout(timer);
  }, [friendIdInput, authUserId]);

  async function loadInbox(userId = authUserIdRef.current, coachOverride?: 'zj' | 'lc', friendSource?: Friend[]) {
    if (!userId) return;

    try {
      const inbox = await getInbox(userId);
      const sourceFriends = friendSource || friendsRef.current;
      const activeCoach = coachOverride || selectedCoachRef.current;
      const coachName = coachDisplayName(activeCoach);

      const dmTopics = new Set(inbox.dms.map((item) => item.topic));
      const friendPlaceholders: Conversation[] = sourceFriends
        .map((friend) => ({
          topic: buildP2PTopic(userId, friend.id),
          name: friend.username,
          type: 'dm' as const,
          subtitle: 'Friend',
          preview: 'Start chatting',
          unreadCount: 0,
          mentionCount: 0,
          avatarUrl: friend.avatar_url,
          userId: friend.id,
        }))
        .filter((item) => !dmTopics.has(item.topic));

      const list: Conversation[] = [
        {
          topic: inbox.coach.topic,
          name: coachName,
          type: 'coach',
          subtitle: 'AI Coach',
          preview: inbox.coach.last_message_preview,
          unreadCount: Number(inbox.coach.unread_count || 0),
          mentionCount: Number(inbox.coach.mention_count || 0),
          avatarUrl: null,
          userId: 0,
        },
        ...inbox.dms.map((item) => ({
          topic: item.topic,
          name: item.username,
          type: 'dm' as const,
          subtitle: 'Direct Message',
          preview: item.last_message_preview,
          unreadCount: Number(item.unread_count || 0),
          mentionCount: Number(item.mention_count || 0),
          avatarUrl: item.avatar_url,
          userId: Number(item.other_user_id),
        })),
        ...friendPlaceholders,
        ...inbox.groups.map((item) => ({
          topic: item.topic,
          name: item.name,
          type: 'group' as const,
          subtitle: groupCoachSubtitle(item.coach_enabled),
          preview: item.last_message_preview,
          unreadCount: Number(item.unread_count || 0),
          mentionCount: Number(item.mention_count || 0),
          avatarUrl: null,
          groupId: item.id,
          coachEnabled: item.coach_enabled,
        })),
      ];

      setConversations(list);

      if (!activeTopicRef.current || !list.some((item) => item.topic === activeTopicRef.current)) {
        setActiveTopic(list[0]?.topic || '');
      }

      list.forEach((conversation) => realtimeRef.current?.subscribe(conversation.topic));
    } catch (err: any) {
      setError(err.message || 'Failed to load conversations.');
    }
  }

  async function loadMessagesForTopic(topic: string) {
    try {
      const rows = await getMessages(topic);
      if (activeTopicRef.current !== topic) return;
      clearCoachReplyRevealQueue();
      setAnimatedCoachReplies({});
      messagesRef.current = rows;
      setMessages(rows);
      scrollChatToBottom('auto');
      const latestMessageId = rows.length > 0 ? rows[rows.length - 1]?.id : undefined;
      if (authUserId > 0) {
        await markMessagesRead({ userId: authUserId, topic, messageId: latestMessageId });
      }
      await loadInbox();
    } catch (err: any) {
      setError(err.message || 'Failed to load messages.');
    }
  }

  async function loadActiveGroupMembers(groupId: number) {
    try {
      setActiveGroupMembersPending(true);
      const members = await getGroupMembers(groupId);
      setActiveGroupMembers(members);
    } catch (err: any) {
      setError(err.message || 'Failed to load group members.');
    } finally {
      setActiveGroupMembersPending(false);
    }
  }

  async function loadFriendsData(userId = authUserId): Promise<Friend[]> {
    if (!userId) return [];

    try {
      const [friendRes, requestRes] = await Promise.all([getFriends(userId), getFriendRequests(userId)]);
      setFriends(friendRes.friends);
      friendsRef.current = friendRes.friends;
      setRequests(requestRes.requests);
      return friendRes.friends;
    } catch (err: any) {
      setError(err.message || 'Failed to load friends.');
      return [];
    }
  }

  async function loadFeed(userId = authUserId) {
    if (!userId) return;

    try {
      setFeedLoading(true);
      const result = await getFeed(userId);
      setFeed(result.feed);
    } catch (err: any) {
      setError(err.message || 'Failed to load feed.');
    } finally {
      setFeedLoading(false);
    }
  }

  async function loadMentions(userId = authUserId) {
    if (!userId) return;

    try {
      setMentionsLoading(true);
      const rows = await getMentionNotifications(userId);
      setMentionNotifications(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load mentions.');
    } finally {
      setMentionsLoading(false);
    }
  }

  async function loadLeaderboard(userId = authUserId) {
    if (!userId) return;

    try {
      setLeaderboardLoading(true);
      const [leaderboardResult, momentumResult] = await Promise.all([
        getLeaderboard(userId),
        getHealthMomentum(userId),
      ]);
      setLeaderboard(leaderboardResult.leaderboard);
      setHealthMomentum(momentumResult);
    } catch (err: any) {
      setHealthMomentum(null);
      setError(err.message || 'Failed to load leaderboard.');
    } finally {
      setLeaderboardLoading(false);
    }
  }

  async function loadProfile(userId = authUserId) {
    if (!userId) return;

    try {
      const result = await getProfile(userId);
      setProfile(result);
      setProfileDraft({
        bio: result.bio || '',
        fitness_goal: result.fitness_goal || '',
        hobbies: result.hobbies || '',
        avatar_url: result.avatar_url || '',
        background_url: result.background_url || '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load profile.');
    }
  }

  async function loadAuthSessions() {
    try {
      setAuthSessionsLoading(true);
      const rows = await getAuthSessions();
      setAuthSessions(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions.');
    } finally {
      setAuthSessionsLoading(false);
    }
  }

  async function loadSecurityEvents(userId = authUserId) {
    if (!userId) return;
    try {
      setSecurityEventsLoading(true);
      const rows = await getSecurityEvents(userId, 60);
      setSecurityEvents(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load security timeline.');
    } finally {
      setSecurityEventsLoading(false);
    }
  }

  async function loadAbuseReports(userId = authUserId) {
    if (!userId) return;
    try {
      setAbuseReportsLoading(true);
      const rows = await getAbuseReports(userId);
      setAbuseReports(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load safety reports.');
    } finally {
      setAbuseReportsLoading(false);
    }
  }

  async function loadConnectInfo(userId = authUserId) {
    if (!userId) return;

    try {
      const payload = await getFriendConnectCode(userId);
      const code = payload.connectCode || `zym://add-friend?uid=${userId}`;
      setConnectId(String(payload.connectId || '').trim() || String(userId).padStart(6, '0'));
      setConnectCode(code);
      setConnectExpiresAt(payload.expiresAt || '');
      const qr = await QRCode.toDataURL(code, {
        margin: 1,
        color: {
          dark: '#2f3c35',
          light: '#ffffff',
        },
        width: 220,
      });
      setConnectQrDataUrl(qr);
    } catch {
      const fallback = `zym://add-friend?uid=${userId}`;
      setConnectId(String(userId).padStart(6, '0'));
      setConnectCode(fallback);
      setConnectExpiresAt('');
      setConnectQrDataUrl('');
    }
  }

  async function handleSendMessage() {
    if (!isOnline) {
      setError('You are offline. Reconnect to send messages.');
      return;
    }
    if (pendingSend || !activeTopic || (!composer.trim() && attachments.length === 0)) return;

    const optimisticId = -Date.now();
    const clientMessageId = createClientMessageId();

    try {
      setPendingSend(true);
      const uploadedMedia = attachments.length > 0
        ? await Promise.all(attachments.map((file) => uploadFile(file, {
            source: 'web_message',
            visibility: 'private',
          })))
        : [];
      const uploadedUrls = uploadedMedia.map((item) => item.url);
      const uploadedMediaIds = uploadedMedia
        .map((item) => item.mediaId)
        .filter((item): item is string => Boolean(item));
      const text = composer.trim();

      setComposer('');
      setAttachments([]);
      setComposerActionsOpen(false);

      const optimistic: ChatMessage = {
        id: optimisticId,
        topic: activeTopic,
        from_user_id: authUserId,
        content: text || null,
        media_urls: uploadedUrls,
        mentions: [],
        reply_to: null,
        created_at: new Date().toISOString(),
        username: authUsername,
        avatar_url: null,
        is_coach: false,
        client_message_id: clientMessageId,
      };
      const nextMessages = [...messagesRef.current, optimistic];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      scrollChatToBottom('smooth');

      const response = await sendMessage({
        fromUserId: authUserId,
        topic: activeTopic,
        content: text,
        mediaUrls: uploadedUrls,
        mediaIds: uploadedMediaIds,
        clientMessageId,
      });

      if (response?.message) {
        upsertActiveTopicMessage(response.message, response.clientMessageId || clientMessageId);
      }

      showNotice('Message sent.');
      await loadInbox();
    } catch (err: any) {
      const nextMessages = messagesRef.current.filter((item) => item.id !== optimisticId && item.client_message_id !== clientMessageId);
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      setError(err.message || 'Failed to send message.');
    } finally {
      setPendingSend(false);
    }
  }

  async function handleOpenDM(friendId: number) {
    try {
      const topic = await openDM(authUserId, friendId);
      setTab('messages');
      setActiveTopic(topic);
      await loadInbox();
    } catch (err: any) {
      setError(err.message || 'Failed to open direct message.');
    }
  }

  async function handleAddFriend(user: UserSummary) {
    try {
      await addFriend({ userId: authUserId, friendId: user.id });
      showNotice(`Friend request sent to ${user.username}.`);
      setFriendQuery('');
      setFriendSearchResult([]);
      const rows = await loadFriendsData();
      await loadInbox(authUserId, undefined, rows);
    } catch (err: any) {
      setError(err.message || 'Failed to add friend.');
    }
  }

  async function handleAddById() {
    const rawInput = friendIdInput.trim();
    const useConnectCode = isPotentialConnectCode(rawInput);
    const parsedId = parseFriendIdentifier(rawInput);

    if (!useConnectCode && (!parsedId || parsedId <= 0)) {
      setFriendByIdError('Enter a valid user ID or connect code.');
      return;
    }

    if (!useConnectCode && parsedId === authUserId) {
      setFriendByIdError('You cannot add yourself.');
      return;
    }
    if (useConnectCode && friendByIdPreview?.id === authUserId) {
      setFriendByIdError('You cannot add yourself.');
      return;
    }

    try {
      setFriendByIdPending(true);
      if (useConnectCode) {
        await addFriend({ userId: authUserId, connectCode: rawInput });
      } else {
        await addFriend({ userId: authUserId, friendId: Number(parsedId) });
      }
      showNotice(`Friend request sent${parsedId ? ` to user #${parsedId}` : ''}.`);
      setFriendIdInput('');
      setFriendByIdPreview(null);
      setFriendByIdError('');
      const rows = await loadFriendsData();
      await loadInbox(authUserId, undefined, rows);
    } catch (err: any) {
      setFriendByIdError(err.message || 'Failed to send request.');
    } finally {
      setFriendByIdPending(false);
    }
  }

  async function handleAcceptFriend(friendId: number) {
    try {
      await acceptFriend(authUserId, friendId);
      const rows = await loadFriendsData();
      await loadInbox(authUserId, undefined, rows);
      showNotice('Friend request accepted.');
    } catch (err: any) {
      setError(err.message || 'Action failed.');
    }
  }

  async function handleScanFriendQr(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setConnectScanError('');
    const BarcodeDetectorImpl = (window as any).BarcodeDetector as
      | (new (init?: { formats?: string[] }) => { detect: (source: ImageBitmap) => Promise<Array<{ rawValue?: string }>> })
      | undefined;

    if (!BarcodeDetectorImpl) {
      setConnectScanError('QR scanning is not supported in this browser. Paste the connect code manually.');
      return;
    }

    try {
      const detector = new BarcodeDetectorImpl({ formats: ['qr_code'] });
      const bitmap = await createImageBitmap(file);
      const results = await detector.detect(bitmap);
      bitmap.close();

      const value = results[0]?.rawValue?.trim();
      if (!value) {
        setConnectScanError('No QR code detected from this image.');
        return;
      }
      setFriendIdInput(value);
      showNotice('QR code detected. Review user and send request.');
    } catch {
      setConnectScanError('Failed to decode this QR image.');
    }
  }

  function openCreateGroupDialog() {
    setGroupName('');
    setGroupInviteQuery('');
    setGroupInvitees([]);
    setGroupInviteSuggestions([]);
    setGroupCoachEnabled(selectedCoach);
    setCreateGroupOpen(true);
  }

  function handleAddGroupInvitee(user: UserSummary) {
    setGroupInvitees((current) => {
      if (current.some((item) => item.id === user.id) || current.length >= GROUP_MEMBER_LIMIT - 1) {
        return current;
      }
      return [...current, user];
    });
    setGroupInviteQuery('');
    setGroupInviteSuggestions([]);
  }

  function handleRemoveGroupInvitee(userId: number) {
    setGroupInvitees((current) => current.filter((item) => item.id !== userId));
  }

  async function handleCreateGroup(event: FormEvent) {
    event.preventDefault();
    if (!groupName.trim() || createGroupPending) return;

    try {
      setCreateGroupPending(true);
      const groupId = await createGroup({
        ownerId: authUserId,
        name: groupName.trim(),
        coachEnabled: groupCoachEnabled,
      });

      for (const member of groupInvitees) {
        await addGroupMember({ groupId, userId: member.id });
      }

      setGroupName('');
      setGroupInviteQuery('');
      setGroupInvitees([]);
      setGroupInviteSuggestions([]);
      setGroupCoachEnabled(selectedCoach);
      setCreateGroupOpen(false);
      showNotice('Group created.');
      await loadInbox();
    } catch (err: any) {
      setError(err.message || 'Failed to create group.');
    } finally {
      setCreateGroupPending(false);
    }
  }

  async function handleInviteToActiveGroup(user?: UserSummary) {
    if (!activeConversation?.groupId) return;
    const candidate = user || activeGroupInviteSuggestions[0];
    if (!candidate) return;

    try {
      setActiveGroupInvitePending(true);
      await addGroupMember({ groupId: activeConversation.groupId, userId: candidate.id });
      setActiveGroupInviteQuery('');
      setActiveGroupInviteSuggestions([]);
      showNotice(`Invited ${candidate.username}.`);
      await loadActiveGroupMembers(activeConversation.groupId);
      await loadInbox();
    } catch (err: any) {
      setError(err.message || 'Failed to invite member.');
    } finally {
      setActiveGroupInvitePending(false);
    }
  }

  async function handleRemoveFromActiveGroup(member: GroupMember) {
    if (!activeConversation?.groupId) return;

    try {
      setActiveGroupRemovePendingId(member.id);
      await removeGroupMember({ groupId: activeConversation.groupId, userId: member.id });
      showNotice(`Removed ${member.username}.`);
      await loadActiveGroupMembers(activeConversation.groupId);
      await loadInbox();
    } catch (err: any) {
      setError(err.message || 'Failed to remove member.');
    } finally {
      setActiveGroupRemovePendingId(null);
    }
  }

  async function handleCreatePost() {
    if (!isOnline) {
      setError('You are offline. Reconnect to publish posts.');
      return;
    }
    if (!postText.trim() && postFiles.length === 0) return;

    try {
      setPostPending(true);
      const uploadedMedia = postFiles.length > 0
        ? await Promise.all(postFiles.map((file) => uploadFile(file, {
            source: 'web_community_post',
            visibility: postVisibility,
          })))
        : [];
      const mediaUrls = uploadedMedia.map((item) => item.url);
      const mediaIds = uploadedMedia
        .map((item) => item.mediaId)
        .filter((item): item is string => Boolean(item));
      await createPost({
        userId: authUserId,
        type: mediaUrls.length > 0 ? 'media' : 'text',
        content: postText.trim(),
        mediaUrls,
        mediaIds,
        visibility: postVisibility,
      });

      setPostText('');
      setPostFiles([]);
      setPostVisibility('friends');
      showNotice('Post published.');
      await loadFeed();
    } catch (err: any) {
      setError(err.message || 'Failed to publish post.');
    } finally {
      setPostPending(false);
    }
  }

  async function handleReact(postId: number) {
    try {
      await reactToPost(postId, authUserId, 'like');
      await loadFeed();
    } catch (err: any) {
      setError(err.message || 'Failed to react to post.');
    }
  }

  function openPostVisibilityDialog(post: FeedPost) {
    setPostMenuOpenId(null);
    setPostActionDialog({
      open: true,
      mode: 'visibility',
      post,
      pending: false,
    });
  }

  function openPostDeleteDialog(post: FeedPost) {
    setPostMenuOpenId(null);
    setPostActionDialog({
      open: true,
      mode: 'delete',
      post,
      pending: false,
    });
  }

  async function submitPostActionDialog() {
    if (!postActionDialog.post) return;

    const post = postActionDialog.post;
    const nextVisibility = post.visibility === 'public' ? 'friends' : 'public';

    try {
      setPostActionDialog((prev) => ({ ...prev, pending: true }));

      if (postActionDialog.mode === 'delete') {
        await deletePost({ userId: authUserId, postId: post.id });
        setExpandedPostIds((prev) => prev.filter((id) => id !== post.id));
        setExpandedCommentPostIds((prev) => prev.filter((id) => id !== post.id));
        setPostCommentsById((prev) => {
          const next = { ...prev };
          delete next[post.id];
          return next;
        });
        showNotice('Post deleted.');
      } else {
        await updatePostVisibility({
          userId: authUserId,
          postId: post.id,
          visibility: nextVisibility,
        });
        showNotice(`Post scope changed to ${nextVisibility === 'public' ? 'public' : 'friends only'}.`);
      }

      setPostActionDialog({
        open: false,
        mode: 'delete',
        post: null,
        pending: false,
      });
      await loadFeed();
    } catch (err: any) {
      setError(err.message || (postActionDialog.mode === 'delete' ? 'Failed to delete post.' : 'Failed to update post scope.'));
      setPostActionDialog((prev) => ({ ...prev, pending: false }));
    }
  }

  async function loadPostComments(postId: number) {
    try {
      setCommentLoadingPostIds((prev) => (prev.includes(postId) ? prev : [...prev, postId]));
      const comments = await getPostComments(postId);
      setPostCommentsById((prev) => ({ ...prev, [postId]: comments }));
    } catch (err: any) {
      setError(err.message || 'Failed to load comments.');
    } finally {
      setCommentLoadingPostIds((prev) => prev.filter((id) => id !== postId));
    }
  }

  async function togglePostComments(postId: number) {
    const nextExpanded = !expandedCommentPostIds.includes(postId);
    setExpandedCommentPostIds((prev) => (
      prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId]
    ));
    if (nextExpanded && !postCommentsById[postId]) {
      await loadPostComments(postId);
    }
  }

  async function handleCreatePostComment(postId: number) {
    const content = String(commentDraftByPostId[postId] || '').trim();
    if (!content) return;

    try {
      setCommentPendingPostId(postId);
      await createPostComment({ postId, userId: authUserId, content });
      setCommentDraftByPostId((prev) => ({ ...prev, [postId]: '' }));
      await Promise.all([
        loadPostComments(postId),
        loadFeed(),
        loadMentions(),
      ]);
      showNotice('Comment posted.');
    } catch (err: any) {
      setError(err.message || 'Failed to create comment.');
    } finally {
      setCommentPendingPostId(null);
    }
  }

  async function handleOpenMention(notification: MentionNotification) {
    try {
      await markMentionNotificationsRead({ userId: authUserId, ids: [notification.id] });
      setMentionNotifications((prev) => prev.map((item) => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )));
    } catch {
      // Best effort; navigation should still continue.
    }

    const topic = String(notification.topic || '').trim();
    if (!topic) return;

    if (topic.startsWith('post_')) {
      const postId = Number(topic.replace('post_', ''));
      if (Number.isInteger(postId) && postId > 0) {
        setTab('community');
        if (!expandedCommentPostIds.includes(postId)) {
          setExpandedCommentPostIds((prev) => [...prev, postId]);
        }
        await loadPostComments(postId);
      }
      return;
    }

    setTab('messages');
    setActiveTopic(topic);
  }

  async function handleMarkAllMentionsRead() {
    try {
      await markMentionNotificationsRead({ userId: authUserId });
      setMentionNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch (err: any) {
      setError(err.message || 'Failed to mark mentions as read.');
    }
  }

  function togglePostExpanded(postId: number) {
    setExpandedPostIds((prev) => (prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId]));
  }

  async function handleSyncHealth() {
    if (!isOnline) {
      setError('You are offline. Reconnect to sync health data.');
      return;
    }
    try {
      setSyncPending(true);
      await syncHealth({
        userId: authUserId,
        steps: Number(healthSync.steps) || 0,
        calories: Number(healthSync.calories) || 0,
      });
      showNotice('Health data synced.');
      await loadLeaderboard();
    } catch (err: any) {
      setError(err.message || 'Failed to sync health data.');
    } finally {
      setSyncPending(false);
    }
  }

  async function handleSaveProfile() {
    if (!profile) return;

    try {
      setProfilePending(true);
      await updateProfile({
        userId: profile.id,
        bio: profileDraft.bio,
        fitness_goal: profileDraft.fitness_goal,
        hobbies: profileDraft.hobbies,
        avatar_url: profileDraft.avatar_url,
        avatar_visibility: 'public',
        background_url: profileDraft.background_url,
        background_visibility: 'friends',
      });

      await loadProfile();
      showNotice('Profile updated');
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setProfilePending(false);
    }
  }

  async function handleUploadProfileAsset(file: File, kind: 'avatar' | 'background') {
    if (!profile) return;
    try {
      if (kind === 'avatar') setProfileAvatarUploading(true);
      if (kind === 'background') setProfileBackgroundUploading(true);
      if (isHeicLikeFile(file)) {
        throw new Error(`${kind === 'avatar' ? 'Avatar' : 'Background'} uploads do not support HEIC/HEIF yet. Please convert it to JPG or PNG first.`);
      }
      const maxSize = kind === 'avatar' ? MAX_PROFILE_AVATAR_FILE_SIZE_BYTES : MAX_PROFILE_BACKGROUND_FILE_SIZE_BYTES;
      if (file.size > maxSize) {
        const label = kind === 'avatar' ? 'Avatar' : 'Background';
        const mb = kind === 'avatar' ? 5 : 10;
        throw new Error(`${label} image is too large. Please upload a file smaller than ${mb}MB.`);
      }
      const uploaded = await uploadFile(file, {
        source: kind === 'avatar' ? 'web_profile_avatar' : 'web_profile_background',
        visibility: kind === 'avatar' ? 'public' : 'friends',
      });
      if (!uploaded.url) {
        throw new Error('Upload did not return a file URL.');
      }

      if (kind === 'avatar') {
        setProfileDraft((prev) => ({ ...prev, avatar_url: uploaded.url }));
        await updateProfile({
          userId: profile.id,
          avatar_url: uploaded.url,
          avatar_visibility: 'public',
        });
        const nextFriends = await loadFriendsData();
        await Promise.all([
          loadProfile(),
          loadFeed(),
          loadLeaderboard(),
        ]);
        await loadInbox(authUserId, undefined, nextFriends);
        showNotice('Avatar updated.');
      } else {
        setProfileDraft((prev) => ({ ...prev, background_url: uploaded.url }));
        await updateProfile({
          userId: profile.id,
          background_url: uploaded.url,
          background_visibility: 'friends',
        });
        await loadProfile();
        showNotice('Cover updated.');
      }
    } catch (err: any) {
      setError(err.message || `Failed to upload ${kind}.`);
    } finally {
      if (kind === 'avatar') setProfileAvatarUploading(false);
      if (kind === 'background') setProfileBackgroundUploading(false);
    }
  }

  async function handleSwitchCoach(coach: 'zj' | 'lc') {
    try {
      await selectCoach(authUserId, coach);
      setSelectedCoach(coach);
      setCoach(coach);
      showNotice(`Switched to ${coach.toUpperCase()} coach.`);
      await loadInbox(authUserId, coach);
    } catch (err: any) {
      setError(err.message || 'Failed to switch coach.');
    }
  }

  async function openConversationProfile() {
    if (!activeConversation) return;

    if (activeConversation.type === 'coach') {
      setProfileViewer({
        open: true,
        loading: false,
        type: 'coach',
        coachId: selectedCoach,
        data: null,
      });
      return;
    }

    const targetUserId = activeConversation.userId;
    if (!targetUserId) {
      setError('Profile is unavailable for this conversation.');
      return;
    }

    setProfileViewer({
      open: true,
      loading: true,
      type: 'user',
      userId: targetUserId,
      data: null,
    });

    try {
      const data = await getPublicProfile(targetUserId);
      setProfileViewer({
        open: true,
        loading: false,
        type: 'user',
        userId: targetUserId,
        data,
      });
    } catch (err: any) {
      setProfileViewer((prev) => ({ ...prev, loading: false, data: null }));
      setError(err.message || 'Failed to load profile.');
    }
  }

  async function handleRevokeSession(sessionId: string) {
    if (!sessionId) return;
    try {
      setAuthSessionPendingId(sessionId);
      await revokeAuthSession(sessionId);
      setAuthSessions((prev) => prev.filter((session) => session.sessionId !== sessionId));
      showNotice('Session revoked.');
    } catch (err: any) {
      setError(err.message || 'Failed to revoke session.');
    } finally {
      setAuthSessionPendingId(null);
    }
  }

  async function handleLogoutAllSessions() {
    try {
      setLogoutAllSessionsPending(true);
      await logoutAllSessions();
      await loadAuthSessions();
      showNotice('Other sessions have been logged out.');
    } catch (err: any) {
      setError(err.message || 'Failed to logout other sessions.');
    } finally {
      setLogoutAllSessionsPending(false);
    }
  }

  function openAbuseReportDialog(
    targetType: 'user' | 'post' | 'message' | 'group',
    targetId: number,
    defaultReason: string,
    details = '',
  ) {
    setAbuseReportDraft({
      open: true,
      targetType,
      targetId,
      reason: defaultReason.slice(0, 80),
      details: details.slice(0, 1200),
      title: targetType === 'user' ? 'Report user' : targetType === 'post' ? 'Report post' : 'Report content',
      pending: false,
    });
  }

  async function submitAbuseReport() {
    if (!abuseReportDraft.targetId || abuseReportDraft.pending) return;
    const reason = abuseReportDraft.reason.trim().slice(0, 80);
    if (!reason) {
      setError('Please include a reason for this report.');
      return;
    }
    try {
      setAbuseReportDraft((prev) => ({ ...prev, pending: true }));
      await createAbuseReport({
        userId: authUserId,
        targetType: abuseReportDraft.targetType,
        targetId: abuseReportDraft.targetId,
        reason,
        details: abuseReportDraft.details.slice(0, 1200),
      });
      setAbuseReportDraft({
        open: false,
        targetType: 'user',
        targetId: null,
        reason: '',
        details: '',
        title: 'Report content',
        pending: false,
      });
      showNotice('Report submitted. Thank you for helping keep the community safe.');
      await loadAbuseReports();
    } catch (err: any) {
      setError(err.message || 'Failed to submit report.');
      setAbuseReportDraft((prev) => ({ ...prev, pending: false }));
    }
  }

  async function handleLogout() {
    try {
      await logoutSession();
    } catch {
      // Ignore logout API errors; always clear local auth.
    }
    clearAuth();
    realtimeRef.current?.disconnect();
    router.replace('/login');
  }

  async function handleDeleteAccount() {
    if (!authUserId || deleteAccountPending) return;

    try {
      setDeleteAccountPending(true);
      await deleteAccount(authUserId);
      setDeleteAccountDialogOpen(false);
      clearAuth();
      realtimeRef.current?.disconnect();
      router.replace('/register');
    } catch (err: any) {
      setError(err.message || 'Failed to delete account.');
    } finally {
      setDeleteAccountPending(false);
    }
  }

  function removeAttachmentAt(index: number, setter: Dispatch<SetStateAction<File[]>>) {
    setter((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  }

  function onFileSelect(existingFiles: File[], setter: Dispatch<SetStateAction<File[]>>) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const list = event.target.files ? Array.from(event.target.files) : [];
      const merged = mergeMediaFiles(existingFiles, list);
      setter(merged.files);
      if (merged.errors.length > 0) {
        setError(merged.errors[0]);
      }
      event.target.value = '';
    };
  }

  const activeTab = tab === 'friends' ? 'community' : tab;
  const activeConversationCoach = resolveConversationCoachId(activeConversation, selectedCoach);
  const activeConversationTheme = coachTheme(activeConversationCoach);
  const selectedCoachTheme = coachTheme(selectedCoach);
  const selectedCoachButtonClass = coachButtonClass(selectedCoach);
  const isCoachWorkspaceOpen = activeConversation?.type === 'coach' && coachPanelMode !== 'chat';
  const activeCoachWorkspaceMode: CoachWorkspaceMode = coachPanelMode === 'chat' ? 'info' : coachPanelMode;
  const activeConversationButtonClass = coachButtonClass(activeConversation?.type === 'group'
    ? normalizeCoachId(activeConversation.coachEnabled)
    : activeConversationCoach);
  const createGroupButtonClass = groupCoachEnabled === 'none' ? 'btn btn-ghost' : coachButtonClass(groupCoachEnabled);
  const selectedTabLabel = tabs.find((item) => item.key === activeTab)?.label || 'Message';
  const topLeaderboardMetric = Math.max(
    ...filteredLeaderboard.map((entry) => (
      leaderboardMetric === 'steps'
        ? Number(entry.steps || 0)
        : Number(entry.calories_burned || 0)
    )),
    1,
  );
  const suggestedCommunities = [
    { icon: 'bolt', name: 'Daily Push', meta: 'Training accountability room' },
    { icon: 'nutrition', name: 'Macro Circle', meta: 'Meals, prep, and protein check-ins' },
    { icon: 'favorite', name: 'Recovery Crew', meta: 'Sleep, stress, and habit momentum' },
  ];
  const trendingTopics = ['#hybridtraining', '#mealprep', '#coachcheckin', '#habitstack', '#accountability'];

  const renderAppHeader = (
    title: string,
    subtitle: string,
    searchValue?: string,
    onSearchChange?: (value: string) => void,
    searchPlaceholder?: string,
    searchRef?: { current: HTMLInputElement | null },
    trailing?: JSX.Element,
  ) => (
    <header className="flex flex-col gap-4 border-b border-slate-200/50 bg-white/20 px-5 py-3 backdrop-blur-sm md:flex-row md:items-center md:justify-between md:px-8">
      <div>
        <h1 className="text-[1.9rem] font-semibold tracking-tight text-slate-900 md:text-[2.15rem]">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        {onSearchChange ? (
          <label className="relative block min-w-[240px] md:min-w-[280px]">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 18 }}>search</span>
            <input
              ref={searchRef}
              className="w-full rounded-full border border-white/60 bg-white/60 py-2 pl-9 pr-4 text-sm text-slate-700 outline-none transition"
              style={{
                borderColor: selectedCoach === 'lc' ? 'rgba(242,138,58,0.18)' : undefined,
                boxShadow: 'none',
              }}
              value={searchValue || ''}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder || 'Search'}
            />
          </label>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-full bg-white/60 text-slate-600 transition hover:bg-white"
            onClick={() => router.push('/friends')}
            title="Friends"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>group</span>
          </button>
          {trailing}
        </div>
      </div>
    </header>
  );

  const renderMessagePage = () => (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200/50 bg-white/20 px-5 py-3 backdrop-blur-sm md:px-8">
        <h1 className="text-[1.9rem] font-semibold tracking-tight text-slate-900 md:text-[2.15rem]">Message</h1>
        <label className="relative block w-full max-w-[320px]">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 18 }}>search</span>
          <input
            ref={conversationSearchRef}
            className="w-full rounded-full border border-white/60 bg-white/60 py-2 pl-9 pr-4 text-sm text-slate-700 outline-none transition"
            style={{ borderColor: selectedCoachTheme.borderColor }}
            value={conversationQuery}
            onChange={(event) => setConversationQuery(event.target.value)}
            placeholder="Search conversation..."
          />
        </label>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6 xl:flex-row">
        <section className="flex w-full flex-col gap-3 xl:w-[320px]">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-2xl border border-white/60 bg-white/55 px-4 py-3 text-sm font-semibold transition hover:bg-white/75"
            style={{
              color: selectedCoachTheme.ink,
              borderColor: selectedCoachTheme.borderColor,
            }}
            onClick={openCreateGroupDialog}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
            Create Group
          </button>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {filteredConversations.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-slate-300/80 bg-white/25 p-5 text-sm text-slate-500">
                No conversations matched this search.
              </div>
            ) : null}
            {filteredConversations.map((conversation) => (
              <ConversationTile
                key={conversation.topic}
                item={conversation}
                active={activeTopic === conversation.topic}
                onSelect={setActiveTopic}
                resolveAssetUrl={resolveApiAssetUrl}
                displayNameFromTopic={displayNameFromTopic}
                avatarInitial={avatarInitial}
              />
            ))}
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[28px] border border-white/60 bg-white/35 backdrop-blur-xl">
          <header className="flex items-center gap-3 border-b border-slate-200/50 bg-white/25 px-5 py-3 md:px-6 rounded-t-[28px]">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="flex size-10 items-center justify-center rounded-[14px]"
                style={{
                  background: activeConversation?.type === 'coach'
                    ? activeConversationCoach === 'lc'
                      ? 'rgba(242,138,58,0.14)'
                      : 'rgba(105,121,247,0.14)'
                    : 'rgba(255,255,255,0.75)',
                  color: activeConversationCoach === 'lc' ? 'var(--coach-lc)' : 'var(--coach-zj)',
                }}
                onClick={() => void openConversationProfile()}
                disabled={!activeConversation || activeConversation.type === 'group'}
                title={activeConversation && activeConversation.type !== 'group' ? 'Open profile' : 'Profile unavailable'}
              >
                {activeConversation?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveApiAssetUrl(activeConversation.avatarUrl)}
                    alt={activeConversation.name}
                    style={{ width: 40, height: 40, borderRadius: 14, objectFit: 'cover' }}
                  />
                ) : (
                  <span className="text-base font-semibold">{avatarInitial(activeConversation?.name || 'Chat')}</span>
                )}
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-xl font-bold text-slate-900">{activeConversation?.name || 'Select a chat'}</h2>
                  {activeConversation?.type === 'coach' ? (
                    <div ref={coachMenuRef} className="relative flex items-center gap-2">
                      <div className="group relative">
                        <button
                          type="button"
                          className="flex size-6 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-[11px] font-semibold text-slate-500"
                          aria-label="Coach safety notice"
                        >
                          i
                        </button>
                        <div className="pointer-events-none absolute left-0 top-[calc(100%+10px)] z-20 hidden w-[320px] rounded-2xl border border-white/70 bg-white/95 p-3 text-xs leading-5 text-slate-600 shadow-xl whitespace-pre-line group-hover:block">
                          {COACH_SAFETY_TOOLTIP}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100/80 text-slate-500 transition hover:bg-slate-200/80"
                        aria-label="Open coach workspace"
                        onClick={() => setCoachMenuOpen((prev) => !prev)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>more_horiz</span>
                      </button>
                      {coachMenuOpen ? (
                        <div className="absolute right-0 top-[calc(100%+12px)] z-30 flex min-w-[180px] flex-col rounded-[22px] border border-white/70 bg-white/95 p-2 shadow-xl">
                          {([
                            ['info', 'Info'],
                            ['meals', 'Meals'],
                            ['trains', 'Trains'],
                          ] as Array<[CoachWorkspaceMode, string]>).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                                coachPanelMode === value ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-100/80'
                              }`}
                              onClick={() => {
                                setCoachPanelMode(value);
                                setCoachMenuOpen(false);
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {activeConversation?.type === 'group' ? (
                    <button
                      type="button"
                      className="flex size-9 items-center justify-center rounded-full border border-slate-200 bg-slate-100/80 text-slate-500 transition hover:bg-slate-200/80"
                      aria-label="Open group settings"
                      onClick={() => setGroupSettingsOpen(true)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>more_horiz</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </header>

          {isCoachWorkspaceOpen ? (
            <CoachWorkspacePanel
              userId={authUserId}
              active={ready && authUserId > 0}
              mode={activeCoachWorkspaceMode}
              coachId={activeConversationCoach}
              onNotice={showNotice}
              onError={setError}
              onBackToChat={() => setCoachPanelMode('chat')}
              onOpenMedia={openMediaLightbox}
            />
          ) : (
            <>
              <div ref={chatStreamRef} className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
                {messages.map((message, index) => {
                  const mine = message.from_user_id === authUserId;
                  const previous = index > 0 ? messages[index - 1] : null;
                  const previousDate = parseDisplayDate(previous?.created_at)?.toDateString() || null;
                  const currentDate = parseDisplayDate(message.created_at)?.toDateString() || null;
                  const showDateDivider = !previous || previousDate !== currentDate;
                  const compact = !!previous && previous.from_user_id === message.from_user_id && !showDateDivider;
                  const showMetaLine = !compact || mine;
                  const counterpartyName = message.is_coach
                    ? coachDisplayName(activeConversationCoach)
                    : message.username || (activeConversation?.type === 'coach' ? coachDisplayName(activeConversationCoach) : 'User');
                  const senderLabel = mine ? 'You' : counterpartyName;
                  const avatarText = avatarInitial(counterpartyName);
                  const counterpartyAvatarUrl = !mine && !message.is_coach
                    ? resolveApiAssetUrl(
                        message.avatar_url
                        || (activeConversation?.type === 'dm' ? activeConversation.avatarUrl || '' : ''),
                      )
                    : '';
                  const isCoachReply = !mine && message.is_coach;
                  const revealedCoachSegmentCount = isCoachReply ? animatedCoachReplies[String(message.id)] : undefined;
                  const contentSegments = isCoachReply ? splitReplySegments(message.content) : [];
                  const isInlineCoachReveal = isCoachReply && typeof revealedCoachSegmentCount === 'number';
                  const hasRemainingCoachSegments = isCoachReply
                    && (revealedCoachSegmentCount ?? contentSegments.length) < contentSegments.length;
                  const renderedSegments = isCoachReply
                    ? contentSegments.slice(0, revealedCoachSegmentCount ?? contentSegments.length)
                    : (message.content ? [message.content] : []);
                  const senderMetaLabel = !mine && activeConversation?.type === 'coach' ? '' : senderLabel;
                  const showMessageMedia = !isCoachReply || !isInlineCoachReveal || !hasRemainingCoachSegments;

                  return (
                    <div key={`${message.id}-${message.created_at}`} className="mb-5">
                      {showDateDivider ? (
                        <div className="mb-4 flex items-center gap-4 py-2">
                          <div className="h-px flex-1 bg-slate-200/60" />
                          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">{formatDayLabel(message.created_at)}</span>
                          <div className="h-px flex-1 bg-slate-200/60" />
                        </div>
                      ) : null}

                      <div className={`flex gap-3 ${mine ? 'justify-end' : 'justify-start'} ${compact ? 'mt-2' : ''}`}>
                        {!mine ? (
                          <div
                            className={`mt-1 flex size-8 items-center justify-center rounded-full text-xs font-semibold ${compact ? 'opacity-0' : ''}`}
                            style={{
                              background: message.is_coach
                                ? (activeConversationCoach === 'lc' ? 'rgba(242,138,58,0.14)' : 'rgba(105,121,247,0.12)')
                                : 'rgba(148,163,184,0.16)',
                              color: message.is_coach
                                ? (activeConversationCoach === 'lc' ? 'var(--coach-lc)' : 'var(--coach-zj)')
                                : 'rgb(71 85 105)',
                            }}
                          >
                            {compact ? '' : counterpartyAvatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={counterpartyAvatarUrl}
                                alt={counterpartyName}
                                className="h-full w-full rounded-full object-cover"
                              />
                            ) : avatarText}
                          </div>
                        ) : null}

                        <article className={`max-w-[82%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                          {showMetaLine ? (
                            <div className={`flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400 ${mine ? 'justify-end' : 'justify-start'}`}>
                              {senderMetaLabel ? (
                                <strong
                                  className="font-semibold"
                                  style={{
                                    color: !mine && message.is_coach
                                      ? activeConversationTheme.ink
                                      : 'var(--ink-500)',
                                  }}
                                >
                                  {senderMetaLabel}
                                </strong>
                              ) : null}
                              <span>{formatTime(message.created_at)}</span>
                            </div>
                          ) : null}

                          {showMessageMedia && message.media_urls?.length > 0 ? (
                            <div
                              className={`mb-2 flex max-w-full gap-2 overflow-x-auto pb-1 ${mine ? 'justify-end' : 'justify-start'}`}
                              style={{
                                scrollbarWidth: 'none',
                              }}
                            >
                              {message.media_urls.map((url) => {
                                const mediaUrl = resolveApiAssetUrl(url);
                                if (!mediaUrl) return null;
                                return (
                                  <button
                                    key={mediaUrl}
                                    type="button"
                                    className="relative h-32 w-32 shrink-0 overflow-hidden rounded-[22px] border border-white/70 bg-white/85 shadow-sm transition hover:-translate-y-0.5 md:h-36 md:w-36"
                                    onClick={() => openMediaLightbox(mediaUrl, `${senderLabel} attachment`)}
                                  >
                                    {isVideoUrl(mediaUrl) ? (
                                      <>
                                        <video
                                          src={mediaUrl}
                                          muted
                                          playsInline
                                          preload="metadata"
                                          className="h-full w-full object-cover"
                                        />
                                        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                                          Video
                                        </span>
                                      </>
                                    ) : (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={mediaUrl}
                                        alt="attachment"
                                        className="h-full w-full object-cover"
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}

                          {renderedSegments.map((segment, segmentIndex) => (
                            <div
                              key={`${message.id}-segment-${segmentIndex}`}
                              className={`rounded-[22px] px-4 py-3 shadow-sm ${
                                mine
                                  ? 'rounded-tr-md border border-white/80 bg-white/80 text-slate-800'
                                  : 'rounded-tl-md text-white'
                              } ${segmentIndex > 0 ? 'mt-2' : ''}`}
                              style={!mine ? (
                                message.is_coach
                                  ? {
                                      background: activeConversationTheme.gradient,
                                      boxShadow: activeConversationCoach === 'lc'
                                        ? '0 18px 36px rgba(242,138,58,0.22)'
                                        : '0 18px 36px rgba(105,121,247,0.22)',
                                    }
                                  : {
                                      background: 'rgba(100,116,139,0.95)',
                                      boxShadow: '0 18px 36px rgba(100,116,139,0.22)',
                                    }
                              ) : undefined}
                            >
                              {segment ? <p className="text-sm leading-6">{renderMessageInlineLinks(segment)}</p> : null}
                            </div>
                          ))}

                          {isCoachReply && hasRemainingCoachSegments ? (
                            <div
                              className="mt-2 inline-flex items-center gap-3 rounded-full border border-white/60 bg-white/75 px-4 py-2 text-sm shadow-sm"
                              style={{
                                color: activeConversationTheme.ink,
                              }}
                            >
                              <span>{avatarText} is typing...</span>
                              <span className="typing-dots" aria-hidden="true">
                                <i />
                                <i />
                                <i />
                              </span>
                            </div>
                          ) : null}
                        </article>
                      </div>
                    </div>
                  );
                })}

                {typingLabel ? (
                  <div className="mt-4 flex justify-start">
                    <div className="inline-flex items-center gap-3 rounded-full bg-white/70 px-4 py-2 text-sm text-slate-500">
                      <span>{typingLabel}</span>
                      <span className="typing-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  </div>
                ) : null}

              </div>

              <footer className="border-t border-slate-200/50 bg-white/35 px-5 py-4 md:px-6">
                <MediaPreviewGrid
                  items={attachmentPreviews}
                  onRemove={(index) => removeAttachmentAt(index, setAttachments)}
                  wrapperClassName="chat-preview-grid"
                  itemClassName="chat-preview-item"
                  mediaHeight={128}
                  showVideoControls={false}
                />

                <div className="mt-3 flex flex-col gap-3 rounded-[24px] border border-white/60 bg-white/65 p-3 md:flex-row md:items-end">
                  <div ref={composerMenuRef} className="relative">
                    <button
                      className="flex size-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                      type="button"
                      onClick={() => setComposerActionsOpen((prev) => !prev)}
                      aria-label="Open attachment actions"
                    >
                      <span className="material-symbols-outlined">add_circle</span>
                    </button>
                    {composerActionsOpen ? (
                      <div className="absolute bottom-[calc(100%+12px)] left-0 z-10 flex min-w-[240px] flex-col gap-2 rounded-[22px] border border-white/70 bg-white/95 p-3 shadow-xl">
                        <label className="btn btn-ghost flex-col items-start gap-0.5" style={{ cursor: 'pointer', justifyContent: 'flex-start' }}>
                          <span>Photo / Video</span>
                          <span className="text-xs font-normal text-slate-400">Up to 50MB each</span>
                          <input
                            hidden
                            type="file"
                            multiple
                            accept="image/*,video/*"
                            onChange={(event) => {
                              onFileSelect(attachments, setAttachments)(event);
                              setComposerActionsOpen(false);
                            }}
                          />
                        </label>
                        {attachments.length > 0 ? (
                          <button
                            className="btn btn-ghost"
                            type="button"
                            style={{ justifyContent: 'flex-start' }}
                            onClick={() => {
                              setAttachments([]);
                              setComposerActionsOpen(false);
                            }}
                          >
                            Clear attachments
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <input
                    className="flex-1 rounded-[18px] border border-transparent bg-transparent px-2 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                  />

                  <div className="flex items-center gap-2 self-end">
                    {activeConversation?.type === 'group' && activeConversation.coachEnabled !== 'none' ? (
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          if (!/(^|\s)@coach\b/i.test(composer)) {
                            setComposer((prev) => (prev.trim() ? `@coach ${prev}` : '@coach '));
                          }
                        }}
                        type="button"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        @coach
                      </button>
                    ) : null}
                    <button
                      className="flex size-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                      disabled={pendingSend || !isOnline}
                      onClick={() => void handleSendMessage()}
                    >
                      <span className="material-symbols-outlined">send</span>
                    </button>
                  </div>
                </div>

                {attachments.length > 0 ? (
                  <p className="mt-3 text-xs text-slate-500">
                    {attachments.length}/{MAX_MEDIA_ATTACHMENTS} file(s) ready
                  </p>
                ) : null}
                {!isOnline ? <p className="mt-1 text-xs text-[color:var(--danger)]">Reconnect to send messages and media.</p> : null}
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );

  const renderCommunityPage = () => (
    <div className="flex h-full flex-col">
      {renderAppHeader(
        'Community Feed',
        '',
        communityQuery,
        setCommunityQuery,
        'Search community posts...',
        undefined,
      )}

      <div className="grid min-h-0 flex-1 gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-h-0 overflow-y-auto pr-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <section className="rounded-[30px] border border-white/70 bg-white/55 p-5 shadow-[0_24px_60px_rgba(105,121,247,0.06)] backdrop-blur-xl">
              <div className="flex gap-4">
                <div
                  className="flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold"
                  style={{
                    background: selectedCoach === 'lc' ? 'rgba(242,138,58,0.12)' : 'rgba(105,121,247,0.12)',
                    color: selectedCoachTheme.ink,
                  }}
                >
                  {profileDraft.avatar_url || profile?.avatar_url || feed.find((post) => post.user_id === authUserId)?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveApiAssetUrl(
                        profileDraft.avatar_url
                        || profile?.avatar_url
                        || feed.find((post) => post.user_id === authUserId)?.avatar_url
                        || '',
                      )}
                      alt={authUsername || profile?.username || 'Your avatar'}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    avatarInitial(authUsername || profile?.username || 'U')
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <textarea
                    className="min-h-[110px] w-full resize-none border-0 bg-transparent p-0 text-base text-slate-800 outline-none placeholder:text-slate-400"
                    value={postText}
                    placeholder="What's on your mind?"
                    onChange={(event) => setPostText(event.target.value)}
                  />
                  <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/60 pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        className="flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition"
                        style={{
                          background: selectedCoach === 'lc' ? 'rgba(242,138,58,0.1)' : 'rgba(105,121,247,0.1)',
                          color: selectedCoachTheme.ink,
                        }}
                      >
                        <span className="material-symbols-outlined text-lg">image</span>
                        Add media
                        <input hidden type="file" multiple accept="image/*,video/*" onChange={onFileSelect(postFiles, setPostFiles)} />
                      </label>
                      <span className="text-xs text-slate-500">{postFiles.length > 0 ? `${postFiles.length} file(s) selected` : 'No files selected'}</span>
                      {postFiles.length > 0 ? (
                        <button className="btn btn-ghost" style={{ padding: '6px 10px' }} type="button" onClick={() => setPostFiles([])}>
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="relative flex min-w-[170px] items-center">
                        <select
                          className="w-full appearance-none rounded-full border border-white/70 bg-white/80 px-4 py-2.5 pr-10 text-sm font-medium text-slate-700 outline-none transition"
                          style={{
                            borderColor: selectedCoachTheme.borderColor,
                            color: selectedCoachTheme.ink,
                          }}
                          value={postVisibility}
                          onChange={(event) => setPostVisibility(event.target.value as 'public' | 'friends')}
                          aria-label="Post visibility"
                        >
                          <option value="public">Public</option>
                          <option value="friends">Friends only</option>
                        </select>
                        <span
                          className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                          style={{ fontSize: 18 }}
                        >
                          expand_more
                        </span>
                      </label>
                      <button className={selectedCoachButtonClass} disabled={postPending || !isOnline} onClick={() => void handleCreatePost()}>
                        {postPending ? 'Posting...' : 'Post'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <MediaPreviewGrid
                items={postFilePreviews}
                onRemove={(index) => removeAttachmentAt(index, setPostFiles)}
                wrapperClassName="media-grid-preview"
                itemClassName="media-thumb"
              />
            </section>

            {feedLoading ? (
              <section className="rounded-[30px] border border-white/70 bg-white/45 p-5 backdrop-blur-xl">
                <div className="feed-skeleton" />
                <div className="feed-skeleton" />
              </section>
            ) : null}

            {filteredFeed.map((post) => (
              <article key={post.id} className="rounded-[30px] border border-white/70 bg-white/45 p-5 backdrop-blur-xl transition hover:bg-white/55">
                <header className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-11 items-center justify-center overflow-hidden rounded-full font-semibold"
                      style={{
                        background: selectedCoach === 'lc' ? 'rgba(242,138,58,0.12)' : 'rgba(105,121,247,0.12)',
                        color: selectedCoachTheme.ink,
                      }}
                    >
                      {post.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveApiAssetUrl(post.avatar_url)}
                          alt={post.username}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        avatarInitial(post.username)
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-slate-900">{post.username}</strong>
                        <span className="text-xs text-slate-400">{formatTime(post.created_at)}</span>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: selectedCoachTheme.ink }}>{post.type}</p>
                    </div>
                  </div>
                  <div className="relative" ref={postMenuOpenId === post.id ? postMenuRef : null}>
                    <button
                      className="rounded-full p-1 text-slate-400 transition hover:bg-white/70 hover:text-slate-600"
                      type="button"
                      aria-label="Open post actions"
                      onClick={() => setPostMenuOpenId((current) => (current === post.id ? null : post.id))}
                    >
                      <span className="material-symbols-outlined">more_horiz</span>
                    </button>
                    {postMenuOpenId === post.id ? (
                      <div className="absolute right-0 top-[calc(100%+10px)] z-20 min-w-[220px] rounded-[22px] border border-white/80 bg-white/95 p-2 shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
                        {post.user_id === authUserId ? (
                          <>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                              onClick={() => openPostVisibilityDialog(post)}
                            >
                              <span>Change scope</span>
                              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                {post.visibility === 'public' ? 'To friends' : 'To public'}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-[color:var(--danger)] transition hover:bg-[rgba(239,68,68,0.06)]"
                              onClick={() => openPostDeleteDialog(post)}
                            >
                              <span>Delete</span>
                              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                            </button>
                          </>
                        ) : (
                          <div className="px-3 py-2 text-sm leading-6 text-slate-500">
                            Only the author can change scope or delete this post.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </header>

                {post.content ? (
                  <>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                      {expandedPostIds.includes(post.id) || post.content.length <= 180
                        ? post.content
                        : `${post.content.slice(0, 180)}...`}
                    </p>
                    {post.content.length > 180 ? (
                      <button className="mt-2 text-sm font-semibold" style={{ color: selectedCoachTheme.ink }} onClick={() => togglePostExpanded(post.id)}>
                        {expandedPostIds.includes(post.id) ? 'Collapse' : 'Read more'}
                      </button>
                    ) : null}
                  </>
                ) : null}

                {post.media_urls?.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {post.media_urls.map((url) => {
                      const mediaUrl = resolveApiAssetUrl(url);
                      if (!mediaUrl) return null;
                      return (
                        <button
                          key={mediaUrl}
                          type="button"
                          className="overflow-hidden rounded-[22px] border border-white/70 bg-white/40"
                          onClick={() => openMediaLightbox(mediaUrl, `${post.username}'s post media`)}
                        >
                          {isVideoUrl(mediaUrl) ? (
                            <video src={mediaUrl} muted playsInline preload="metadata" style={{ width: '100%', maxHeight: 220 }} />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mediaUrl} alt="feed media" style={{ width: '100%', maxHeight: 260, objectFit: 'cover' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-full bg-white/70 px-4 py-2 text-sm text-slate-600 transition"
                    style={{ border: `1px solid ${selectedCoachTheme.borderColor}` }}
                    onClick={() => void handleReact(post.id)}
                  >
                    Like {post.reaction_count || 0}
                  </button>
                  <button
                    className="rounded-full bg-white/70 px-4 py-2 text-sm text-slate-600 transition"
                    style={{ border: `1px solid ${selectedCoachTheme.borderColor}` }}
                    onClick={() => void togglePostComments(post.id)}
                  >
                    Comments {post.comment_count || 0}
                  </button>
                  <button
                    className="rounded-full bg-white/70 px-4 py-2 text-sm text-slate-600 transition"
                    style={{ border: `1px solid ${selectedCoachTheme.borderColor}` }}
                    onClick={() => togglePostExpanded(post.id)}
                  >
                    {expandedPostIds.includes(post.id) ? 'Hide detail' : 'Detail'}
                  </button>
                  <button
                    className="rounded-full bg-white/70 px-4 py-2 text-sm text-slate-600 transition"
                    style={{ border: `1px solid ${selectedCoachTheme.borderColor}` }}
                    onClick={() => openAbuseReportDialog('post', post.id, 'spam_or_harassment', `Reported from feed post #${post.id}`)}
                  >
                    Report
                  </button>
                </div>

                {expandedCommentPostIds.includes(post.id) ? (
                  <section className="mt-4 rounded-[22px] border border-white/70 bg-white/55 p-4">
                    <div className="space-y-3">
                      {commentLoadingPostIds.includes(post.id) ? <p className="text-sm text-slate-500">Loading comments...</p> : null}
                      {(postCommentsById[post.id] || []).map((comment) => (
                        <article key={comment.id} className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3">
                          <div className="flex items-start gap-3">
                            <div
                              className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
                              style={{
                                background: selectedCoach === 'lc' ? 'rgba(242,138,58,0.12)' : 'rgba(105,121,247,0.12)',
                                color: selectedCoachTheme.ink,
                              }}
                            >
                              {comment.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={resolveApiAssetUrl(comment.avatar_url)}
                                  alt={comment.username}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                avatarInitial(comment.username)
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                                <strong className="text-slate-700">{comment.username}</strong>
                                <span>{formatTime(comment.created_at)}</span>
                              </div>
                              <p className="mt-2 text-sm text-slate-600">{comment.content}</p>
                            </div>
                          </div>
                        </article>
                      ))}
                      {!commentLoadingPostIds.includes(post.id) && (postCommentsById[post.id] || []).length === 0 ? (
                        <p className="text-sm text-slate-500">No comments yet. Start the conversation.</p>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-col gap-3 md:flex-row">
                      <input
                        className="input-shell"
                        placeholder="Write a comment..."
                        value={commentDraftByPostId[post.id] || ''}
                        onChange={(event) => setCommentDraftByPostId((prev) => ({ ...prev, [post.id]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void handleCreatePostComment(post.id);
                          }
                        }}
                      />
                      <button
                        className={selectedCoachButtonClass}
                        type="button"
                        disabled={commentPendingPostId === post.id}
                        onClick={() => void handleCreatePostComment(post.id)}
                      >
                        {commentPendingPostId === post.id ? 'Posting...' : 'Reply'}
                      </button>
                    </div>
                  </section>
                ) : null}
              </article>
            ))}

            {!feedLoading && filteredFeed.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-slate-300/80 bg-white/25 p-5 text-sm text-slate-500">
                No community posts matched your search.
              </div>
            ) : null}
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col gap-5 overflow-y-auto xl:flex">
        </aside>
      </div>
    </div>
  );

  const renderLeaderboardPage = () => (
    <div className="flex h-full flex-col">
      {renderAppHeader(
        'Global Rankings',
        '',
        undefined,
        undefined,
        undefined,
        undefined,
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden p-4 md:p-6">
        <div className="px-1">
          <div className="inline-flex rounded-2xl bg-white/40 p-1 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setLeaderboardMetric('steps')}
              className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${leaderboardMetric === 'steps' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              style={leaderboardMetric === 'steps' ? { color: selectedCoachTheme.ink } : undefined}
            >
              Steps
            </button>
            <button
              type="button"
              onClick={() => setLeaderboardMetric('calories')}
              className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${leaderboardMetric === 'calories' ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              style={leaderboardMetric === 'calories' ? { color: selectedCoachTheme.ink } : undefined}
            >
              Calories
            </button>
          </div>
        </div>

        <section className="min-h-0 flex-1 overflow-hidden rounded-[32px] border border-white/70 bg-white/45 backdrop-blur-xl">
          <div className="h-full overflow-auto">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200/60">
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Rank</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">User</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Activity</th>
                  <th className="px-6 py-5 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/60">
                {leaderboardLoading ? (
                  <tr>
                    <td className="px-6 py-8 text-sm text-slate-500" colSpan={4}>Loading leaderboard...</td>
                  </tr>
                ) : null}
                {!leaderboardLoading && filteredLeaderboard.length === 0 ? (
                  <tr>
                    <td className="px-6 py-8 text-sm text-slate-500" colSpan={4}>No ranking data matched this search.</td>
                  </tr>
                ) : null}
                {filteredLeaderboard.map((entry, index) => {
                  const metricValue = leaderboardMetric === 'steps' ? Number(entry.steps || 0) : Number(entry.calories_burned || 0);
                  const ratio = Math.max(0.08, metricValue / topLeaderboardMetric);
                  const displayRank = index + 1;
                  const rankTone = displayRank === 1 ? 'bg-amber-100 text-amber-600' : displayRank === 2 ? 'bg-slate-200 text-slate-600' : displayRank === 3 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500';
                  return (
                    <tr key={entry.id} className="transition hover:bg-white/45">
                      <td className="px-6 py-5">
                        <span className={`flex size-8 items-center justify-center rounded-full text-sm font-bold ${rankTone}`}>
                          {displayRank}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex size-10 items-center justify-center overflow-hidden rounded-full font-semibold"
                            style={{
                              background: selectedCoach === 'lc' ? 'rgba(242,138,58,0.12)' : 'rgba(105,121,247,0.12)',
                              color: selectedCoachTheme.ink,
                            }}
                          >
                            {entry.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={resolveApiAssetUrl(entry.avatar_url)}
                                alt={entry.username}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                            ) : (
                              avatarInitial(entry.username)
                            )}
                          </div>
                          <span className="font-semibold text-slate-800">{entry.username}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm font-medium text-slate-600">
                        {leaderboardMetric === 'steps'
                          ? `${entry.steps || 0} steps`
                          : `${entry.calories_burned || 0} cal`}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full" style={{ width: `${Math.round(ratio * 100)}%`, background: selectedCoachTheme.gradient }} />
                          </div>
                          <span className="text-xs font-bold text-slate-500">{Math.round(ratio * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex justify-center pt-1">
          <button className="rounded-full border border-slate-200/80 bg-white/70 px-8 py-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-white">
            Load more users
          </button>
        </div>

        <div className="grid gap-4 xl:hidden">
          <div className="rounded-[24px] border border-white/70 bg-white/45 p-5 backdrop-blur-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Momentum</p>
            <div className="overflow-x-auto">
              <div className="mt-3 grid grid-cols-2 gap-3">
                <article className="rounded-2xl border border-white/70 bg-white/70 p-4">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Current streak</span>
                  <strong className="mt-2 block text-2xl font-bold text-slate-900">{healthMomentum?.streakDays ?? 0}d</strong>
                </article>
                <article className="rounded-2xl border border-white/70 bg-white/70 p-4">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Avg steps</span>
                  <strong className="mt-2 block text-2xl font-bold text-slate-900">{healthMomentum?.averages.steps ?? 0}</strong>
                </article>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderProfilePage = () => (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-center justify-between border-b border-slate-200/50 bg-white/20 px-5 py-3 backdrop-blur-sm md:px-8">
        <div>
          <h1 className="text-[1.9rem] font-semibold tracking-tight text-slate-900 md:text-[2.15rem]">Profile</h1>
        </div>
      </header>

      <div className="flex flex-col gap-6 p-4 md:p-6">
        <section className="rounded-[32px] border border-white/70 bg-white/50 p-5 backdrop-blur-xl md:p-8">
          <div className="mb-8 overflow-hidden rounded-[28px] border border-white/70 bg-white/60">
            {profileDraft.background_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveApiAssetUrl(profileDraft.background_url)}
                alt="Profile cover"
                className="h-40 w-full object-cover"
              />
            ) : (
              <div className="h-40 w-full bg-[linear-gradient(135deg,rgba(105,121,247,0.16),rgba(242,138,58,0.18))]" />
            )}
          </div>

          <div className="flex flex-col gap-8 md:flex-row md:items-center">
            <div className="relative">
              {profileDraft.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveApiAssetUrl(profileDraft.avatar_url)}
                  alt="Profile avatar"
                  className="size-32 rounded-full object-cover ring-4 ring-white"
                />
              ) : (
                <div className="flex size-32 items-center justify-center rounded-full text-4xl font-bold text-white ring-4 ring-white" style={{ background: selectedCoachTheme.gradient }}>
                  {avatarInitial(authUsername || profile?.username || 'User')}
                </div>
              )}
              <span className="absolute bottom-2 right-2 size-8 rounded-full border-4 border-white bg-emerald-500" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-slate-900">{authUsername || profile?.username || 'User'}</h2>
                  <p className="mt-2 text-sm text-slate-500">ID: {authUserId} • Coach {selectedCoach.toUpperCase()} • Premium loop</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className={selectedCoachButtonClass} style={{ cursor: 'pointer' }}>
                    {profileAvatarUploading ? 'Uploading avatar...' : 'Upload avatar'}
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleUploadProfileAsset(file, 'avatar');
                        }
                        event.target.value = '';
                      }}
                    />
                  </label>
                  <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                    {profileBackgroundUploading ? 'Uploading cover...' : 'Upload cover'}
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleUploadProfileAsset(file, 'background');
                        }
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <article className="rounded-2xl border border-white/70 bg-white/70 p-4">
                  <label className="text-xs font-semibold text-slate-500">Bio</label>
                  <p className="mt-2 text-sm text-slate-800">{profile?.bio || 'Not set'}</p>
                </article>
                <article className="rounded-2xl border border-white/70 bg-white/70 p-4">
                  <label className="text-xs font-semibold text-slate-500">Fitness Goal</label>
                  <p className="mt-2 text-sm text-slate-800">{profile?.fitness_goal || 'Not set'}</p>
                </article>
                <article className="rounded-2xl border border-white/70 bg-white/70 p-4">
                  <label className="text-xs font-semibold text-slate-500">Hobbies</label>
                  <p className="mt-2 text-sm text-slate-800">{profile?.hobbies || 'Not set'}</p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-[28px] border border-white/70 bg-white/45 p-5 backdrop-blur-xl">
            <h2 className="text-xl font-bold text-slate-900">Edit Profile</h2>
            <p className="mt-1 text-sm text-slate-500">Changes sync to iOS and web for the same account.</p>
            <div className="mt-5 grid gap-3">
                <textarea
                  className="input-shell"
                  placeholder="Bio"
                  value={profileDraft.bio}
                  onChange={(event) => setProfileDraft((prev) => ({ ...prev, bio: event.target.value }))}
                />
                <input
                  className="input-shell"
                  placeholder="Fitness goal"
                  value={profileDraft.fitness_goal}
                  onChange={(event) => setProfileDraft((prev) => ({ ...prev, fitness_goal: event.target.value }))}
                />
                <input
                  className="input-shell"
                  placeholder="Hobbies"
                  value={profileDraft.hobbies}
                  onChange={(event) => setProfileDraft((prev) => ({ ...prev, hobbies: event.target.value }))}
                />
                <button className={selectedCoachButtonClass} disabled={profilePending} onClick={() => void handleSaveProfile()}>
                  {profilePending ? 'Saving...' : 'Save profile'}
                </button>
              </div>
            </section>

          <section className="rounded-[28px] border border-white/70 bg-white/45 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Coach Style</h2>
                  <p className="mt-1 text-sm text-slate-500">Choose the energy that fits your workflow.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-4">
                {(['zj', 'lc'] as const).map((coach) => {
                  const theme = coachTheme(coach);
                  const activeCoach = selectedCoach === coach;
                  return (
                    <article
                      key={coach}
                      className={`rounded-[24px] border-2 bg-white p-5 shadow-sm transition ${activeCoach ? '' : 'border-slate-100'}`}
                      style={activeCoach ? { borderColor: theme.borderColor } : undefined}
                    >
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">{coachDisplayName(coach)}</h3>
                          <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: theme.ink }}>
                            {coach === 'zj' ? 'The Technician' : 'The Motivator'}
                          </p>
                        </div>
                        {activeCoach ? (
                          <span
                            className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
                            style={{
                              background: coach === 'lc' ? 'rgba(242,138,58,0.12)' : 'rgba(105,121,247,0.12)',
                              color: theme.ink,
                            }}
                          >
                            Active
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm leading-7 text-slate-600">{theme.description}</p>
                      <button
                        className={`mt-5 w-full rounded-2xl px-4 py-3 font-semibold transition ${activeCoach ? '' : 'bg-slate-100 text-slate-700'}`}
                        style={activeCoach ? { background: theme.gradient, color: '#fff' } : undefined}
                        type="button"
                        onClick={() => void handleSwitchCoach(coach)}
                      >
                        {activeCoach ? `Selected ${coach.toUpperCase()}` : `Select ${coach.toUpperCase()}`}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
        </div>
        <section className="rounded-[28px] border border-[rgba(239,68,68,0.18)] bg-white/55 p-5 backdrop-blur-xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Account actions</h2>
              <p className="mt-1 text-sm text-slate-500">
                Delete account permanently removes your username, email, sessions, friends, logs, and your own content, then releases your username and email for reuse.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-ghost" type="button" onClick={() => void handleLogout()} disabled={deleteAccountPending}>
                Logout
              </button>
              <button
                className="btn btn-danger-soft"
                type="button"
                onClick={() => setDeleteAccountDialogOpen(true)}
                disabled={deleteAccountPending}
              >
                {deleteAccountPending ? 'Deleting...' : 'Delete account'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );

  if (!ready) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div className="surface-card zym-enter" style={{ padding: 26, minWidth: 260, textAlign: 'center' }}>
          <div className="zym-shimmer" style={{ width: 72, height: 72, margin: '0 auto', borderRadius: 20, display: 'grid', placeItems: 'center' }}>
            <strong style={{ color: 'var(--sage-600)', fontSize: 24, fontFamily: 'var(--font-display)' }}>Z</strong>
          </div>
          <p style={{ marginTop: 14, color: 'var(--ink-500)', fontWeight: 600 }}>Preparing your community...</p>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="relative h-screen overflow-hidden">
        {!isOnline ? (
          <div className="absolute left-4 right-4 top-3 z-20 rounded-full border border-[rgba(242,138,58,0.24)] bg-white/85 px-4 py-2 text-center text-xs font-semibold text-[color:var(--coach-lc-ink)] shadow-[0_10px_20px_rgba(177,99,34,0.12)] backdrop-blur-xl">
            Offline mode: browsing is available, but sending messages and posts is temporarily disabled.
          </div>
        ) : null}

        <div className="pointer-events-none absolute -left-16 -top-16 size-72 rounded-full bg-[radial-gradient(circle,_rgba(105,121,247,0.14)_0%,_rgba(105,121,247,0)_72%)]" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 size-96 rounded-full bg-[radial-gradient(circle,_rgba(242,138,58,0.12)_0%,_rgba(242,138,58,0)_72%)]" />

        <aside className="fixed left-0 top-0 z-30 flex h-screen w-20 flex-col items-center border-r border-slate-200/50 bg-[rgba(255,255,255,0.52)] py-6 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => setTab('messages')}
              className="flex size-12 items-center justify-center rounded-2xl bg-white shadow-[0_18px_34px_rgba(105,121,247,0.18)]"
              title="ZYM"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="ZYM logo" style={{ width: 30, height: 30, objectFit: 'contain' }} />
            </button>

            <nav className="mt-8 flex flex-col gap-4">
              {visibleTabs.map((item) => {
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    aria-label={item.label}
                    title={item.label}
                    className={`relative flex size-12 items-center justify-center rounded-2xl text-slate-500 transition ${active ? '' : 'hover:bg-white/55 hover:text-slate-800'}`}
                    style={active ? {
                      background: selectedCoach === 'lc' ? 'rgba(242,138,58,0.14)' : 'rgba(105,121,247,0.14)',
                      color: selectedCoachTheme.ink,
                    } : undefined}
                  >
                    <TabGlyph icon={item.icon} active={active} />
                    {item.key === 'messages' && totalUnreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[10px] font-bold text-white">
                        {Math.min(totalUnreadCount, 99)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto flex flex-col items-center gap-4">
              <button
                type="button"
                onClick={() => setTab('profile')}
                className="flex size-11 items-center justify-center overflow-hidden rounded-full border-2 bg-white/70 text-sm font-bold"
                style={{
                  borderColor: selectedCoach === 'lc' ? 'rgba(242,138,58,0.18)' : 'rgba(105,121,247,0.18)',
                  color: selectedCoachTheme.ink,
                }}
                title={authUsername || 'Profile'}
              >
                {profileDraft.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveApiAssetUrl(profileDraft.avatar_url)} alt={authUsername || 'Profile'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  avatarInitial(authUsername || profile?.username || 'U')
                )}
              </button>
            </div>
        </aside>

        <section className={`relative z-10 ml-20 h-screen min-w-0 overflow-hidden ${isOnline ? '' : 'pt-12'}`}>
            {activeTab === 'messages' ? renderMessagePage() : null}
            {activeTab === 'community' ? renderCommunityPage() : null}
            {activeTab === 'leaderboard' ? renderLeaderboardPage() : null}
            {activeTab === 'profile' ? renderProfilePage() : null}
        </section>
      </main>

      {profileViewer.open ? (
        <div
          className="zym-fade profile-viewer-overlay"
          onClick={() => setProfileViewer((prev) => ({ ...prev, open: false }))}
        >
          <div className="surface-card profile-viewer-modal" onClick={(event) => event.stopPropagation()}>
            <header className="profile-viewer-header">
              <h3 style={{ fontSize: 24 }}>
                {profileViewer.type === 'coach' ? coachDisplayName(profileViewer.coachId || selectedCoach) : 'Profile'}
              </h3>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setProfileViewer((prev) => ({ ...prev, open: false }))}
              >
                Close
              </button>
            </header>

            {profileViewer.loading ? (
              <p className="entity-sub" style={{ marginTop: 16 }}>Loading profile...</p>
            ) : null}

            {!profileViewer.loading && profileViewer.type === 'coach' ? (
              <section className="profile-viewer-section">
                <div
                  className="flow-card flow-card-soft form-grid"
                  style={{
                    background: coachTheme((profileViewer.coachId || selectedCoach) as 'zj' | 'lc').softBackground,
                    borderColor: coachTheme((profileViewer.coachId || selectedCoach) as 'zj' | 'lc').borderColor,
                  }}
                >
                  <strong style={{ fontSize: 18 }}>{coachDisplayName(profileViewer.coachId || selectedCoach)}</strong>
                  <p style={{ color: coachTheme((profileViewer.coachId || selectedCoach) as 'zj' | 'lc').ink, lineHeight: 1.5 }}>
                    {coachTheme((profileViewer.coachId || selectedCoach) as 'zj' | 'lc').description}
                  </p>
                  <p style={{ color: 'var(--ink-500)', fontSize: 13 }}>
                    Supports: nutrition photo analysis, training feedback, profile planning, and progress guidance.
                  </p>
                </div>
              </section>
            ) : null}

            {!profileViewer.loading && profileViewer.type === 'user' && profileViewer.data ? (
              <section className="profile-viewer-section">
                <div className="profile-viewer-hero">
                  {profileViewer.data.profile.background_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveApiAssetUrl(profileViewer.data.profile.background_url)} alt="background" style={{ width: '100%', height: 170, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: 170, background: 'linear-gradient(120deg, rgba(242,138,58,0.16), rgba(108,124,246,0.18))' }} />
                  )}
                </div>

                <div className="profile-viewer-userline">
                  {profileViewer.data.profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveApiAssetUrl(profileViewer.data.profile.avatar_url)}
                      alt={profileViewer.data.profile.username}
                      style={{ width: 66, height: 66, borderRadius: 18, objectFit: 'cover', border: '1px solid var(--line)' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 66,
                        height: 66,
                        borderRadius: 18,
                        background: coachTheme((profileViewer.data.profile.selected_coach || 'zj') as 'zj' | 'lc').gradient,
                        color: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 700,
                        fontSize: 20,
                      }}
                    >
                      {avatarInitial(profileViewer.data.profile.username)}
                    </div>
                  )}
                  <div>
                    <h4 style={{ fontSize: 24 }}>{profileViewer.data.profile.username}</h4>
                    <p className="entity-sub">User ID: {profileViewer.data.profile.id}</p>
                    <p className="entity-sub">
                      Coach: {coachDisplayName(profileViewer.data.profile.selected_coach || 'zj')}
                    </p>
                  </div>
                </div>

                {profileViewer.data.profile.id !== authUserId ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      const targetId = profileViewer.data?.profile.id;
                      const username = profileViewer.data?.profile.username || 'user';
                      if (!targetId) return;
                      openAbuseReportDialog(
                        'user',
                        targetId,
                        'inappropriate_behavior',
                        `Reported user ${username} from profile viewer`,
                      );
                    }}
                  >
                    Report user
                  </button>
                ) : null}

                <div className="flow-card flow-card-soft form-grid">
                  <p><strong>Bio:</strong> {profileViewer.data.profile.bio || 'No bio yet.'}</p>
                  <p><strong>Goal:</strong> {profileViewer.data.profile.fitness_goal || 'Not set'}</p>
                  <p><strong>Hobbies:</strong> {profileViewer.data.profile.hobbies || 'Not set'}</p>
                </div>

                <div className="flow-card flow-card-soft">
                  <strong>Today&apos;s Health Sync</strong>
                  {profileViewer.data.today_health ? (
                    <p style={{ marginTop: 6, color: 'var(--ink-700)' }}>
                      {profileViewer.data.today_health.steps} steps · {profileViewer.data.today_health.calories_burned} cal
                    </p>
                  ) : (
                    <p style={{ marginTop: 6, color: 'var(--ink-500)' }}>No synced health data today.</p>
                  )}
                </div>

                <div className="flow-card flow-card-soft form-grid">
                  <strong>Recent Posts</strong>
                  {profileViewer.data.recent_posts.length === 0 ? (
                    <p style={{ color: 'var(--ink-500)', fontSize: 13 }}>No public posts yet.</p>
                  ) : (
                    profileViewer.data.recent_posts.map((post) => (
                      <article key={post.id} className="feed-post-card">
                        {post.content ? <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{post.content}</p> : null}
                        {post.media_urls.length > 0 ? (
                          <div className="post-media-grid" style={{ marginTop: 8 }}>
                            {post.media_urls.map((url) => {
                              const mediaUrl = resolveApiAssetUrl(url);
                              if (!mediaUrl) return null;
                              return (
                                <button
                                  key={mediaUrl}
                                  type="button"
                                  className="post-media-item"
                                  onClick={() => openMediaLightbox(mediaUrl, `${profileViewer.data?.profile.username}'s post media`)}
                                >
                                  {isVideoUrl(mediaUrl) ? (
                                    <video src={mediaUrl} muted playsInline preload="metadata" style={{ width: '100%', maxHeight: 180 }} />
                                  ) : (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={mediaUrl} alt="post media" style={{ width: '100%', maxHeight: 180, objectFit: 'cover' }} />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                        <p className="entity-sub" style={{ marginTop: 6 }}>
                          {formatTime(post.created_at)} · Likes: {post.reaction_count}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {mediaLightbox.open ? (
        <div className="zym-fade media-lightbox-overlay" onClick={closeMediaLightbox}>
          <div className="media-lightbox-card" onClick={(event) => event.stopPropagation()}>
            <header className="media-lightbox-header">
              <strong>{mediaLightbox.label}</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                <a className="btn btn-ghost" href={mediaLightbox.url} target="_blank" rel="noreferrer">
                  Open raw
                </a>
                <button className="btn btn-ghost" type="button" onClick={closeMediaLightbox}>
                  Close
                </button>
              </div>
            </header>
            <div className="media-lightbox-body">
              {mediaLightbox.embedUrl ? (
                <iframe
                  src={mediaLightbox.embedUrl}
                  title={mediaLightbox.label}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  style={{ width: '100%', height: '70vh', border: 0, borderRadius: 12 }}
                />
              ) : mediaLightbox.isVideo ? (
                <video src={mediaLightbox.url} controls autoPlay style={{ width: '100%', maxHeight: '70vh', borderRadius: 12 }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaLightbox.url} alt={mediaLightbox.label} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 12 }} />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {groupSettingsOpen && activeConversation?.type === 'group' ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-[rgba(241,245,249,0.72)] px-4 backdrop-blur-md"
          onClick={() => !activeGroupInvitePending && setGroupSettingsOpen(false)}
        >
          <div
            className="w-full max-w-[560px] rounded-[30px] border border-white/80 bg-white/95 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[1.45rem] font-semibold tracking-tight text-slate-900">Group members ({activeGroupMembers.length})</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {groupCoachSubtitle(activeConversation.coachEnabled)}. {GROUP_MEMBER_LIMIT} member max.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => activeConversation.groupId && void loadActiveGroupMembers(activeConversation.groupId)}
                  disabled={activeGroupMembersPending}
                >
                  {activeGroupMembersPending ? 'Loading...' : 'Refresh'}
                </button>
                <button
                  className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                  type="button"
                  onClick={() => setGroupSettingsOpen(false)}
                  aria-label="Close group settings"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="mt-5 max-h-[42vh] space-y-3 overflow-y-auto pr-1">
              {activeGroupMembers.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-slate-300/80 bg-slate-50/80 px-4 py-5 text-sm text-slate-500">
                  No members loaded yet.
                </div>
              ) : (
                activeGroupMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-[22px] border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{member.username}</p>
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{member.role}</p>
                    </div>
                    {activeGroupMyRole === 'owner' && member.role !== 'owner' ? (
                      <button
                        className="text-sm font-semibold"
                        style={{ color: activeConversationTheme.ink }}
                        type="button"
                        onClick={() => void handleRemoveFromActiveGroup(member)}
                        disabled={activeGroupRemovePendingId === member.id}
                      >
                        {activeGroupRemovePendingId === member.id ? 'Removing...' : 'Remove'}
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {activeGroupMyRole === 'owner' ? (
              <div className="mt-6">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Invite members</h4>
                  <span className="text-xs text-slate-400">{Math.max(GROUP_MEMBER_LIMIT - activeGroupMembers.length, 0)} spots left</span>
                </div>
                <div className="mt-3 rounded-[24px] border border-white/70 bg-slate-50/70 p-3">
                  <input
                    className="input-shell border-0 bg-white"
                    placeholder="Search username"
                    value={activeGroupInviteQuery}
                    onChange={(event) => setActiveGroupInviteQuery(event.target.value)}
                    disabled={activeGroupMembers.length >= GROUP_MEMBER_LIMIT}
                  />
                  <div className="mt-3 space-y-2">
                    {activeGroupInviteSuggestionsPending ? (
                      <p className="text-xs text-slate-400">Searching usernames...</p>
                    ) : null}
                    {!activeGroupInviteSuggestionsPending && activeGroupInviteQuery.trim() && activeGroupInviteSuggestions.length === 0 ? (
                      <p className="text-xs text-slate-400">No matching usernames.</p>
                    ) : null}
                    {activeGroupInviteSuggestions.slice(0, 6).map((user) => (
                      <div key={user.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/95 px-3 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{user.username}</p>
                          <p className="text-xs text-slate-500">Ready to invite</p>
                        </div>
                        <button
                          className={activeConversationButtonClass}
                          type="button"
                          onClick={() => void handleInviteToActiveGroup(user)}
                          disabled={activeGroupInvitePending || activeGroupMembers.length >= GROUP_MEMBER_LIMIT}
                        >
                          {activeGroupInvitePending ? 'Inviting...' : 'Invite'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">Only the group owner can invite or remove members.</p>
            )}
          </div>
        </div>
      ) : null}

      {createGroupOpen ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-[rgba(241,245,249,0.72)] px-4 backdrop-blur-md"
          onClick={() => !createGroupPending && setCreateGroupOpen(false)}
        >
          <form
            className="w-full max-w-[560px] rounded-[30px] border border-white/80 bg-white/95 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.16)]"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void handleCreateGroup(event)}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[1.55rem] font-semibold tracking-tight text-slate-900">Create group</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Start a shared chat for friends, accountability, or coach-assisted check-ins.
                </p>
              </div>
              <button
                className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                type="button"
                onClick={() => setCreateGroupOpen(false)}
                disabled={createGroupPending}
                aria-label="Close create group dialog"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Group name</span>
                <input
                  className="input-shell"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Weekend training crew"
                  maxLength={80}
                  autoFocus
                />
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Coach in the group</span>
                <div className="relative">
                  <select
                    className="input-shell w-full appearance-none pr-10"
                    value={groupCoachEnabled}
                    onChange={(event) => setGroupCoachEnabled(event.target.value as 'none' | 'zj' | 'lc')}
                  >
                    <option value="zj">ZJ Coach</option>
                    <option value="lc">LC Coach</option>
                    <option value="none">No coach</option>
                  </select>
                  <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 18 }}>
                    expand_more
                  </span>
                </div>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Invite members</span>
                <div className="rounded-[22px] border border-white/70 bg-white/80 p-3" style={{ borderColor: selectedCoachTheme.borderColor }}>
                  <div className="flex flex-wrap gap-2">
                    {groupInvitees.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/95 px-3 py-2 text-xs text-slate-600"
                        onClick={() => handleRemoveGroupInvitee(member.id)}
                        title="Remove invitee"
                      >
                        <span>{member.username}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                      </button>
                    ))}
                  </div>
                  <input
                    className="mt-3 w-full border-0 bg-transparent px-1 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                    value={groupInviteQuery}
                    onChange={(event) => setGroupInviteQuery(event.target.value)}
                    placeholder="Search username to invite"
                    disabled={groupInvitees.length >= GROUP_MEMBER_LIMIT - 1}
                  />
                  <div className="mt-2 space-y-2">
                    {groupInviteSuggestionsPending ? (
                      <p className="text-xs text-slate-400">Searching usernames...</p>
                    ) : null}
                    {!groupInviteSuggestionsPending && groupInviteQuery.trim() && groupInviteSuggestions.length === 0 ? (
                      <p className="text-xs text-slate-400">No matching usernames.</p>
                    ) : null}
                    {groupInviteSuggestions.slice(0, 6).map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-2xl border border-white/70 bg-white/95 px-3 py-3 text-left transition hover:-translate-y-0.5"
                        onClick={() => handleAddGroupInvitee(user)}
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{user.username}</p>
                          <p className="text-xs text-slate-500">Tap to add to the new group</p>
                        </div>
                        <span className="material-symbols-outlined text-slate-400">person_add</span>
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-400">Optional. Add up to {GROUP_MEMBER_LIMIT - 1} invitees here. The owner counts toward the {GROUP_MEMBER_LIMIT}-member limit.</p>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setCreateGroupOpen(false)}
                disabled={createGroupPending}
              >
                Cancel
              </button>
              <button className={createGroupButtonClass} type="submit" disabled={createGroupPending || !groupName.trim()}>
                {createGroupPending ? 'Creating...' : 'Create group'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteAccountDialogOpen ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-[rgba(241,245,249,0.76)] px-4 backdrop-blur-md"
          onClick={() => !deleteAccountPending && setDeleteAccountDialogOpen(false)}
        >
          <div
            className="w-full max-w-[520px] rounded-[30px] border border-[rgba(239,68,68,0.18)] bg-white/95 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[1.55rem] font-semibold tracking-tight text-slate-900">Delete account</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  This permanently removes your account, conversations, friend relationships, records, and content. Your username and email will become available again.
                </p>
              </div>
              <button
                className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                type="button"
                onClick={() => setDeleteAccountDialogOpen(false)}
                disabled={deleteAccountPending}
                aria-label="Close delete account dialog"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="mt-5 rounded-[22px] border border-[rgba(239,68,68,0.14)] bg-[rgba(254,242,242,0.85)] px-4 py-3 text-sm leading-6 text-[color:#991b1b]">
              This action cannot be undone.
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setDeleteAccountDialogOpen(false)}
                disabled={deleteAccountPending}
              >
                Cancel
              </button>
              <button className="btn btn-danger-soft" type="button" onClick={() => void handleDeleteAccount()} disabled={deleteAccountPending}>
                {deleteAccountPending ? 'Deleting...' : 'Delete account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {postActionDialog.open && postActionDialog.post ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-[rgba(241,245,249,0.76)] px-4 backdrop-blur-md"
          onClick={() => !postActionDialog.pending && setPostActionDialog({ open: false, mode: 'delete', post: null, pending: false })}
        >
          <div
            className="w-full max-w-[520px] rounded-[30px] border border-white/80 bg-white/95 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[1.55rem] font-semibold tracking-tight text-slate-900">
                  {postActionDialog.mode === 'delete' ? 'Delete post' : 'Change post scope'}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {postActionDialog.mode === 'delete'
                    ? 'Do you want to delete this post? This cannot be undone.'
                    : `Do you want to change this post from ${postActionDialog.post.visibility === 'public' ? 'public' : 'friends only'} to ${postActionDialog.post.visibility === 'public' ? 'friends only' : 'public'}?`}
                </p>
              </div>
              <button
                className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                type="button"
                onClick={() => setPostActionDialog({ open: false, mode: 'delete', post: null, pending: false })}
                disabled={postActionDialog.pending}
                aria-label="Close post action dialog"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="mt-5 rounded-[22px] border border-slate-200/70 bg-slate-50/90 px-4 py-3 text-sm leading-6 text-slate-600">
              {postActionDialog.mode === 'delete'
                ? 'The post content, media visibility, and feed entry will be removed from the community view.'
                : 'Friends only means only accepted friends can see it. Public means everyone in the community feed can see it.'}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setPostActionDialog({ open: false, mode: 'delete', post: null, pending: false })}
                disabled={postActionDialog.pending}
              >
                Cancel
              </button>
              <button
                className={postActionDialog.mode === 'delete' ? 'btn btn-danger-soft' : selectedCoachButtonClass}
                type="button"
                onClick={() => void submitPostActionDialog()}
                disabled={postActionDialog.pending}
              >
                {postActionDialog.pending
                  ? (postActionDialog.mode === 'delete' ? 'Deleting...' : 'Updating...')
                  : (postActionDialog.mode === 'delete'
                    ? 'Delete post'
                    : `Change to ${postActionDialog.post.visibility === 'public' ? 'friends only' : 'public'}`)}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {abuseReportDraft.open ? (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-[rgba(241,245,249,0.72)] px-4 backdrop-blur-md"
          onClick={() => !abuseReportDraft.pending && setAbuseReportDraft((prev) => ({ ...prev, open: false }))}
        >
          <form
            className="w-full max-w-[560px] rounded-[30px] border border-white/80 bg-white/95 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.16)]"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void submitAbuseReport();
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[1.55rem] font-semibold tracking-tight text-slate-900">{abuseReportDraft.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Tell us what happened so we can review it faster.
                </p>
              </div>
              <button
                className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                type="button"
                onClick={() => setAbuseReportDraft((prev) => ({ ...prev, open: false }))}
                disabled={abuseReportDraft.pending}
                aria-label="Close report dialog"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Reason</span>
                <input
                  className="input-shell"
                  value={abuseReportDraft.reason}
                  onChange={(event) => setAbuseReportDraft((prev) => ({ ...prev, reason: event.target.value.slice(0, 80) }))}
                  placeholder="spam_or_harassment"
                  maxLength={80}
                  autoFocus
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-700">Details</span>
                <textarea
                  className="min-h-[120px] rounded-[22px] border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400"
                  style={{ borderColor: selectedCoachTheme.borderColor }}
                  value={abuseReportDraft.details}
                  onChange={(event) => setAbuseReportDraft((prev) => ({ ...prev, details: event.target.value.slice(0, 1200) }))}
                  placeholder="Optional context"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setAbuseReportDraft((prev) => ({ ...prev, open: false }))}
                disabled={abuseReportDraft.pending}
              >
                Cancel
              </button>
              <button className={selectedCoachButtonClass} type="submit" disabled={abuseReportDraft.pending || !abuseReportDraft.reason.trim()}>
                {abuseReportDraft.pending ? 'Submitting...' : 'Submit report'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {(notice || error) && (
        <div style={{ position: 'fixed', right: 24, bottom: 24, display: 'grid', gap: 8, zIndex: 30 }}>
          {notice ? (
            <div className="surface-card zym-enter-fast" style={{ padding: '10px 14px', borderColor: '#cde2d3', minWidth: 220 }}>
              {notice}
            </div>
          ) : null}
          {error ? (
            <div className="surface-card zym-enter-fast" style={{ padding: '10px 14px', borderColor: '#f0c8c8', color: '#b43a3a', minWidth: 220 }}>
              {error}
            </div>
          ) : null}
        </div>
      )}

      {showAppIntro ? (
        <div
          className="zym-fade"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(247,251,248,0.86)',
            backdropFilter: 'blur(6px)',
            zIndex: 40,
          }}
        >
          <div className="surface-card" style={{ width: 220, padding: 20, textAlign: 'center' }}>
            <div className="zym-shimmer zym-float" style={{ width: 64, height: 64, margin: '0 auto', borderRadius: 18, display: 'grid', placeItems: 'center' }}>
              <strong style={{ color: 'var(--sage-600)', fontSize: 26, fontFamily: 'var(--font-display)' }}>Z</strong>
            </div>
            <p style={{ marginTop: 12, fontWeight: 700, fontFamily: 'var(--font-display)' }}>ZYM</p>
            <p style={{ marginTop: 6, color: 'var(--ink-500)', fontSize: 12 }}>Loading your space...</p>
          </div>
        </div>
      ) : null}
    </>
  );
}

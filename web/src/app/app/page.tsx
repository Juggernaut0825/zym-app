'use client';

import { ChangeEvent, Dispatch, FormEvent, SetStateAction, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  acceptFriend,
  addFriend,
  addGroupMember,
  createGroup,
  getActivityNotifications,
  createPostComment,
  createPost,
  deletePost,
  deleteAccount,
  createAbuseReport,
  getConversationNotificationPreference,
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
  getNotificationPreferences,
  getSecurityEvents,
  getMessages,
  getPostComments,
  getPublicProfile,
  getProfile,
  getStoredLocation,
  getUserPublic,
  logoutSession,
  markActivityNotificationsRead,
  markMentionNotificationsRead,
  markMessagesRead,
  openDM,
  logoutAllSessions,
  revokeAuthSession,
  reactToPost,
  removeGroupMember,
  resolveFriendConnectCode,
  searchUsers,
  searchLocations,
  enableCoach,
  reverseLocation,
  sendMessage,
  syncHealth,
  updateConversationNotificationPreference,
  updateNotificationPreferences,
  updatePostVisibility,
  updateProfile,
  uploadFile,
} from '@/lib/api';
import { resolveApiAssetUrl } from '@/lib/config';
import { clearAuth, getAuth } from '@/lib/auth-storage';
import { RealtimeClient } from '@/lib/realtime';
import { ConversationTile } from '@/components/chat/ConversationTile';
import { CoachCalendarPanel } from '@/components/chat/CoachCalendarPanel';
import { MediaPreviewGrid } from '@/components/media/MediaPreviewGrid';
import { WelcomeFlow } from '@/components/onboarding/WelcomeFlow';
import { CoachAvatar } from '@/components/onboarding/CoachAvatar';
import {
  ActivityNotification,
  AppSocketEvent,
  ChatMessage,
  AuthSession,
  AbuseReport,
  ConversationNotificationPreference,
  FeedComment,
  FeedPost,
  Friend,
  GroupMember,
  HealthMomentumResponse,
  LocationSelection,
  LeaderboardEntry,
  MentionNotification,
  NotificationPreferences,
  SecurityEvent,
  StoredUserLocation,
  PublicProfileResponse,
  PublicUser,
  Profile,
  UserSummary,
} from '@/lib/types';

const APP_TITLE = 'ZYM Community Coach';
const BASE_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><defs><linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f28a3a"/><stop offset="50%" stop-color="#e17734"/><stop offset="100%" stop-color="#6c7cf6"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="2" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><circle cx="60" cy="60" r="55" fill="#0a0a0a" stroke="url(#logoGradient)" stroke-width="3"/><path d="M30 35 L90 35 L90 45 L50 75 L90 75 L90 85 L30 85 L30 75 L70 45 L30 45 Z" fill="url(#logoGradient)" filter="url(#glow)"/><path d="M75 30 L85 50 L78 50 L85 70 L75 50 L82 50 Z" fill="#fbbf24" opacity="0.9"/><circle cx="25" cy="60" r="3" fill="#f28a3a" opacity="0.65"/><circle cx="95" cy="60" r="3" fill="#6c7cf6" opacity="0.65"/><circle cx="60" cy="60" r="45" fill="none" stroke="#f28a3a" stroke-width="1" opacity="0.28"/><circle cx="60" cy="60" r="50" fill="none" stroke="#6c7cf6" stroke-width="0.5" opacity="0.22"/></svg>`;

const tabs = [
  { key: 'messages', label: 'Message', icon: 'chat_bubble' },
  { key: 'community', label: 'Community', icon: 'groups' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar_month' },
  { key: 'profile', label: 'Profile', icon: 'person' },
] as const;

const visibleTabs = tabs;

type VisibleTabKey = (typeof tabs)[number]['key'];
type TabKey = VisibleTabKey | 'friends';
type TabIcon = (typeof tabs)[number]['icon'];
type CoachId = 'zj' | 'lc';

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
  coachId?: CoachId;
  coachEnabled?: string;
}

interface ProfileViewerState {
  open: boolean;
  loading: boolean;
  surface: 'content-page' | 'message-pane';
  type: 'coach' | 'user';
  coachId?: 'zj' | 'lc';
  userId?: number;
  data?: PublicProfileResponse | null;
}

interface CommunityNotificationEntry {
  key: string;
  kind: 'activity' | 'mention';
  title: string;
  snippet: string;
  icon: string;
  is_read: boolean;
  created_at: string;
  activity?: ActivityNotification;
  mention?: MentionNotification;
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
const MAX_CHAT_MESSAGE_CHARACTERS = 8000;
const GROUP_MEMBER_LIMIT = 500;
const MESSAGE_BUBBLE_THEME_STORAGE_KEY_PREFIX = 'zym.web.messageBubbleTheme.v1.user';
const HASHTAG_STOP_WORDS = new Set([
  'about', 'after', 'also', 'and', 'back', 'been', 'being', 'both', 'but', 'came', 'come', 'does', 'dont',
  'even', 'feel', 'felt', 'from', 'have', 'into', 'just', 'keep', 'more', 'need', 'over', 'really', 'some',
  'that', 'their', 'them', 'then', 'there', 'they', 'this', 'today', 'want', 'what', 'when', 'with', 'would',
  'your', 'yours',
]);

interface MessageBubbleThemePreset {
  id: string;
  label: string;
  incomingFill: string;
  incomingText: string;
  outgoingFill: string;
  outgoingText: string;
}

const messageBubbleThemePresets: MessageBubbleThemePreset[] = [
  { id: 'sand', label: 'Sand', incomingFill: '#faf7f2', incomingText: '#1f2937', outgoingFill: '#f3e9d1', outgoingText: '#1f2937' },
  { id: 'ink', label: 'Ink', incomingFill: '#f1f5f9', incomingText: '#0f172a', outgoingFill: '#334155', outgoingText: '#ffffff' },
  { id: 'sage', label: 'Sage', incomingFill: '#f3faf4', incomingText: '#16321f', outgoingFill: '#d7ead9', outgoingText: '#16321f' },
  { id: 'sky', label: 'Sky', incomingFill: '#f2f8ff', incomingText: '#183153', outgoingFill: '#d7e9fb', outgoingText: '#183153' },
  { id: 'peach', label: 'Peach', incomingFill: '#fff5ef', incomingText: '#4b2416', outgoingFill: '#ffdcca', outgoingText: '#4b2416' },
  { id: 'lavender', label: 'Lavender', incomingFill: '#f7f2ff', incomingText: '#342357', outgoingFill: '#e8dcff', outgoingText: '#342357' },
  { id: 'rose', label: 'Rose', incomingFill: '#fff1f6', incomingText: '#4f1e35', outgoingFill: '#ffd8e8', outgoingText: '#4f1e35' },
  { id: 'midnight', label: 'Midnight', incomingFill: '#eef2ff', incomingText: '#172554', outgoingFill: '#1e293b', outgoingText: '#ffffff' },
];

function resolveMessageBubbleTheme(id?: string | null): MessageBubbleThemePreset {
  const normalized = String(id || '').trim();
  return messageBubbleThemePresets.find((item) => item.id === normalized) || messageBubbleThemePresets[0];
}

function extractHashtagsFromText(value?: string | null): string[] {
  const matches = String(value || '').match(/#([a-z0-9_]{2,32})/gi) || [];
  return Array.from(new Set(matches.map((item) => item.replace(/^#/, '').toLowerCase())));
}

function extractKeywordHashtags(value: string, limit = 6): string[] {
  const counts = new Map<string, number>();
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/#[a-z0-9_]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !HASHTAG_STOP_WORDS.has(item));

  normalized.forEach((token) => {
    counts.set(token, (counts.get(token) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .map(([token]) => token)
    .slice(0, limit);
}

function appendHashtagToDraft(value: string, hashtag: string): string {
  const normalizedTag = String(hashtag || '').trim().replace(/^#/, '').toLowerCase();
  if (!normalizedTag) return value;
  if (new RegExp(`(^|\\s)#${normalizedTag}(?=\\s|$)`, 'i').test(value)) {
    return value;
  }
  const trimmed = value.trimEnd();
  return `${trimmed}${trimmed ? ' ' : ''}#${normalizedTag}`;
}

function stripHashtagsFromDraft(value: string): string {
  return String(value || '')
    .replace(/(^|\s)#[a-z0-9_]{2,32}\b/gi, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function activityNotificationTitle(item: ActivityNotification): string {
  if (item.source_type === 'message') {
    return item.actor_username ? `${item.actor_username} sent a message` : 'New message';
  }
  if (item.source_type === 'post_comment') {
    return item.actor_username ? `${item.actor_username} commented on your post` : 'New post comment';
  }
  return item.actor_username ? `${item.actor_username} liked your post` : 'New post like';
}

function mentionNotificationTitle(item: MentionNotification): string {
  if (item.source_type === 'post_comment') {
    return item.actor_username ? `${item.actor_username} mentioned you in a comment` : 'New post mention';
  }
  return item.actor_username ? `${item.actor_username} mentioned you in chat` : 'New chat mention';
}

function mentionNotificationIcon(item: MentionNotification): string {
  return item.source_type === 'post_comment' ? 'alternate_email' : 'chat';
}

function formatDistanceKm(value: number): string {
  const safe = Number(value);
  if (!Number.isFinite(safe) || safe < 0) return '';
  if (safe < 1) {
    return `${Math.max(100, Math.round(safe * 1000 / 50) * 50)} m away`;
  }
  return `${safe.toFixed(safe >= 10 ? 0 : 1)} km away`;
}

function feedLocationLabel(post: FeedPost): string {
  return String(post.location_label || post.location_city || '').trim();
}

function buildSearchPromptSuggestions(query: string, posts: FeedPost[], trendingTags: Array<{ tag: string; count: number }>): string[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return trendingTags.slice(0, 5).map((item) => `#${item.tag}`);
  }

  const suggestions = new Set<string>();

  trendingTags
    .filter((item) => item.tag.includes(normalizedQuery))
    .slice(0, 4)
    .forEach((item) => suggestions.add(`#${item.tag}`));

  posts.forEach((post) => {
    if (suggestions.size >= 8) return;
    const hashtags = extractHashtagsFromText(post.content);
    hashtags.forEach((tag) => {
      if (tag.includes(normalizedQuery)) {
        suggestions.add(`#${tag}`);
      }
    });

    const source = [displayUserName(post, ''), post.username, post.content].filter(Boolean).join(' ');
    const words = source.match(/[a-z0-9#]+/gi) || [];
    words.forEach((word, index) => {
      const lowered = word.toLowerCase().replace(/^#/, '');
      if (!lowered.includes(normalizedQuery)) return;
      const phrase = words.slice(index, index + 3).join(' ').trim();
      if (phrase.length >= normalizedQuery.length + 3) {
        suggestions.add(phrase);
      }
    });
  });

  if (!suggestions.size) {
    suggestions.add(query.trim());
  }

  return Array.from(suggestions).slice(0, 8);
}
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

function displayUserName(user: { display_name?: string | null; username?: string | null } | null | undefined, fallback = 'User'): string {
  const displayName = String(user?.display_name || '').trim();
  if (displayName) return displayName;
  const username = String(user?.username || '').trim();
  return username || fallback;
}

function normalizeCoachId(value: unknown): CoachId | null {
  return value === 'lc' || value === 'zj' ? value : null;
}

function coachButtonClass(coachId?: CoachId | null): string {
  if (coachId === 'lc') return 'btn btn-lc';
  if (coachId === 'zj') return 'btn btn-zj';
  return 'btn btn-ghost';
}

const neutralTheme = {
  gradient: 'linear-gradient(135deg, rgba(75,85,99,0.98), rgba(17,24,39,0.98))',
  solidBubble: 'rgba(75,85,99,0.98)',
  softBackground: 'linear-gradient(165deg, rgba(255,255,255,0.98), rgba(71,85,105,0.08))',
  borderColor: 'rgba(71,85,105,0.18)',
  ink: '#334155',
  accentBackground: 'rgba(71,85,105,0.12)',
  accentBackgroundStrong: 'rgba(71,85,105,0.14)',
};

const coachCatalog = [
  {
    id: 'zj' as const,
    label: 'ZJ Coach',
    badge: 'Encouraging',
    description: 'Supportive, steady, and momentum-focused.',
  },
  {
    id: 'lc' as const,
    label: 'LC Coach',
    badge: 'Strict',
    description: 'Direct, structured, and accountability-first.',
  },
];

function coachAvatarTheme(coach: CoachId) {
  if (coach === 'lc') {
    return {
      background: 'rgba(242,138,58,0.14)',
      text: 'var(--coach-lc)',
      solid: 'rgba(242,138,58,0.98)',
      border: 'rgba(242,138,58,0.3)',
      soft: 'rgba(242,138,58,0.08)',
    };
  }

  return {
    background: 'rgba(105,121,247,0.14)',
    text: 'var(--coach-zj)',
    solid: 'rgba(105,121,247,0.98)',
    border: 'rgba(105,121,247,0.3)',
    soft: 'rgba(105,121,247,0.08)',
  };
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
    return conversation.coachId || (conversation.topic.startsWith('coach_lc_') ? 'lc' : 'zj');
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

function bubbleThemeStorageKey(userId: number): string {
  return `${MESSAGE_BUBBLE_THEME_STORAGE_KEY_PREFIX}.${userId}`;
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

function loadBubbleThemeId(userId: number): string {
  if (typeof window === 'undefined') return messageBubbleThemePresets[0].id;
  if (!Number.isInteger(userId) || userId <= 0) return messageBubbleThemePresets[0].id;
  try {
    return resolveMessageBubbleTheme(localStorage.getItem(bubbleThemeStorageKey(userId))).id;
  } catch {
    return messageBubbleThemePresets[0].id;
  }
}

function persistBubbleThemeId(userId: number, themeId: string) {
  if (typeof window === 'undefined') return;
  if (!Number.isInteger(userId) || userId <= 0) return;
  try {
    localStorage.setItem(bubbleThemeStorageKey(userId), resolveMessageBubbleTheme(themeId).id);
  } catch {
    // Ignore storage failures.
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

function buildAppUrl(tab: TabKey = 'messages', welcomeState?: 'done', topic?: string): string {
  const params = new URLSearchParams();
  params.set('tab', tab);
  if (welcomeState) {
    params.set('welcome', welcomeState);
  }
  if (topic) {
    params.set('topic', topic);
  }
  return `/app?${params.toString()}`;
}

function createClientMessageId(): string {
  return `web_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function coachTheme(coach: 'zj' | 'lc') {
  return {
    toneClass: coach === 'lc' ? 'coach-lc' : 'coach-zj',
    gradient: neutralTheme.gradient,
    softBackground: neutralTheme.softBackground,
    borderColor: neutralTheme.borderColor,
    ink: neutralTheme.ink,
    description: coach === 'lc'
      ? 'Strict coaching style with direct accountability. Best for users who want hard feedback and action-first guidance.'
      : 'Encouraging coaching style focused on consistency, progressive habits, and sustainable fitness routines.',
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

function MessageAvatarBadge(props: {
  avatarUrl?: string | null;
  label: string;
  background: string;
  color: string;
  coachId?: CoachId | null;
  hidden?: boolean;
  onClick?: () => void;
  interactiveLabel?: string;
}) {
  const {
    avatarUrl,
    label,
    background,
    color,
    coachId,
    hidden = false,
    onClick,
    interactiveLabel,
  } = props;
  const resolvedUrl = avatarUrl ? resolveApiAssetUrl(avatarUrl) : '';
  const isInteractive = typeof onClick === 'function' && !hidden;
  const shellClassName = `mt-1 flex size-7 items-center justify-center rounded-full text-[10px] font-semibold sm:size-8 sm:text-xs ${hidden ? 'opacity-0' : ''}`;
  const content = (
    <>
      {!hidden && coachId ? (
        <CoachAvatar coach={coachId} state="idle" size={32} />
      ) : !hidden && resolvedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedUrl}
          alt={label}
          className="h-full w-full rounded-full object-cover"
        />
      ) : (!hidden ? label : '')}
    </>
  );

  if (isInteractive) {
    return (
      <button
        type="button"
        className={`${shellClassName} transition hover:scale-[1.03]`}
        style={{ background, color }}
        onClick={onClick}
        aria-label={interactiveLabel || `Open ${label} profile`}
        title={interactiveLabel || `Open ${label} profile`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={shellClassName} style={{ background, color }}>
      {content}
    </div>
  );
}

function TypingPill(props: {
  label: string;
  className?: string;
}) {
  const { label, className = '' } = props;

  return (
    <div className={`typing-pill ${className}`.trim()}>
      <span>{label}</span>
      <span className="typing-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </div>
  );
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

function TabGlyph({ icon, active, size = 24 }: { icon: TabIcon; active: boolean; size?: number }) {
  return (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${active ? 1 : 0}, 'wght' 500, 'GRAD' 0, 'opsz' ${size}`,
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
  if (raw === 'leaderboard' || raw === 'calendar') return 'calendar';
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
  const composerMenuRef = useRef<HTMLDivElement | null>(null);
  const communityNotificationsRef = useRef<HTMLDivElement | null>(null);
  const conversationSearchRef = useRef<HTMLInputElement | null>(null);
  const messageDraftsRef = useRef<Record<string, string>>({});
  const messagesRef = useRef<ChatMessage[]>([]);
  const coachReplyRevealTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const coachReplyRevealQueuesRef = useRef<Record<string, ChatMessage[]>>({});
  const coachReplyRevealActiveMessageRef = useRef<Record<string, string | null>>({});
  const skipTypingPulseRef = useRef(false);
  const notificationAudioContextRef = useRef<AudioContext | null>(null);
  const lastNotificationKeyRef = useRef<string>('');
  const lastVisibleTabRef = useRef<VisibleTabKey>('messages');

  const [ready, setReady] = useState(false);
  const [showAppIntro, setShowAppIntro] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [authUserId, setAuthUserId] = useState<number>(0);
  const [authUsername, setAuthUsername] = useState('');
  const [authSelectedCoach, setAuthSelectedCoach] = useState<'zj' | 'lc' | null>(null);
  const [enabledCoaches, setEnabledCoaches] = useState<CoachId[]>([]);
  const [selectedCoach, setSelectedCoach] = useState<'zj' | 'lc'>('zj');
  const [welcomeFlowOpen, setWelcomeFlowOpen] = useState(false);
  const [isWideMessageLayout, setIsWideMessageLayout] = useState(false);
  const [mobileConversationListOpen, setMobileConversationListOpen] = useState(false);
  const [communityActionsOpen, setCommunityActionsOpen] = useState(false);
  const [communityComposerOpen, setCommunityComposerOpen] = useState(false);
  const [communityNotificationsOpen, setCommunityNotificationsOpen] = useState(false);
  const [coachPickerOpen, setCoachPickerOpen] = useState(false);

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
  const [reactingPostIds, setReactingPostIds] = useState<number[]>([]);
  const reactingPostIdsRef = useRef<Set<number>>(new Set());
  const [mentionNotifications, setMentionNotifications] = useState<MentionNotification[]>([]);
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [activityNotifications, setActivityNotifications] = useState<ActivityNotification[]>([]);
  const [activityNotificationsLoading, setActivityNotificationsLoading] = useState(false);
  const [postLocation, setPostLocation] = useState<LocationSelection | null>(null);
  const [sharedLocation, setSharedLocation] = useState<StoredUserLocation | null>(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [locationSearchResults, setLocationSearchResults] = useState<LocationSelection[]>([]);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [locationPickerPending, setLocationPickerPending] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    messageNotificationsEnabled: true,
    postNotificationsEnabled: true,
  });
  const [notificationPreferencesPending, setNotificationPreferencesPending] = useState(false);
  const [messageBubbleThemeId, setMessageBubbleThemeId] = useState(messageBubbleThemePresets[0].id);
  const [conversationNotificationPreference, setConversationNotificationPreference] = useState<ConversationNotificationPreference | null>(null);
  const [conversationSettingsOpen, setConversationSettingsOpen] = useState(false);
  const [conversationSettingsLoading, setConversationSettingsLoading] = useState(false);
  const [conversationSettingsPending, setConversationSettingsPending] = useState(false);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [healthMomentum, setHealthMomentum] = useState<HealthMomentumResponse | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardQuery, setLeaderboardQuery] = useState('');
  const [leaderboardMetric, setLeaderboardMetric] = useState<'steps' | 'calories'>('steps');
  const [healthSync, setHealthSync] = useState({ steps: '0', calories: '0' });
  const [syncPending, setSyncPending] = useState(false);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileDraft, setProfileDraft] = useState({ display_name: '', bio: '', fitness_goal: '', hobbies: '', avatar_url: '', background_url: '' });
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
    surface: 'content-page',
    type: 'coach',
    coachId: 'zj',
    data: null,
  });
  const [profileViewerActionPending, setProfileViewerActionPending] = useState(false);
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
  const requestedTopicRef = useRef('');

  const typingTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(min-width: 1280px)');
    const sync = () => setIsWideMessageLayout(media.matches);
    sync();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    if (isWideMessageLayout) {
      setMobileConversationListOpen(false);
    }
  }, [isWideMessageLayout]);

  useEffect(() => {
    if (!isWideMessageLayout && activeTopic) {
      setMobileConversationListOpen(false);
    }
  }, [activeTopic, isWideMessageLayout]);

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

  const unreadActivityNotificationCount = useMemo(
    () => activityNotifications.filter((item) => !item.is_read).length,
    [activityNotifications],
  );

  const unreadCommunityNotificationCount = unreadMentionCount + unreadActivityNotificationCount;
  const selectedMessageBubbleTheme = useMemo(
    () => resolveMessageBubbleTheme(messageBubbleThemeId),
    [messageBubbleThemeId],
  );

  const prioritizedCommunityNotifications = useMemo<CommunityNotificationEntry[]>(
    () => [
      ...activityNotifications.map((item) => ({
        key: `activity:${item.id}`,
        kind: 'activity' as const,
        title: activityNotificationTitle(item),
        snippet: item.snippet || (item.source_type === 'post_reaction' ? 'Someone liked your post.' : 'Open to view details.'),
        icon: item.source_type === 'message'
          ? 'mail'
          : item.source_type === 'post_comment'
            ? 'comment'
            : 'favorite',
        is_read: item.is_read,
        created_at: item.created_at,
        activity: item,
      })),
      ...mentionNotifications.map((item) => ({
        key: `mention:${item.id}`,
        kind: 'mention' as const,
        title: mentionNotificationTitle(item),
        snippet: item.snippet || 'Open to view the mention.',
        icon: mentionNotificationIcon(item),
        is_read: item.is_read,
        created_at: item.created_at,
        mention: item,
      })),
    ].sort((left, right) => {
      if (left.is_read !== right.is_read) {
        return Number(left.is_read) - Number(right.is_read);
      }
      return Date.parse(right.created_at || '') - Date.parse(left.created_at || '');
    }),
    [activityNotifications, mentionNotifications],
  );

  const trendingHashtags = useMemo(() => {
    const counts = new Map<string, number>();
    feed
      .filter((post) => post.visibility === 'public')
      .forEach((post) => {
      extractHashtagsFromText(post.content).forEach((tag) => {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
      });

    return Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([tag, count]) => ({ tag, count }))
      .slice(0, 12);
  }, [feed]);

  const communitySearchSuggestions = useMemo(
    () => buildSearchPromptSuggestions(communityQuery, feed, trendingHashtags),
    [communityQuery, feed, trendingHashtags],
  );

  const composerHashtagSuggestions = useMemo(() => {
    if (postVisibility !== 'public') return [];
    const keywordSuggestions = extractKeywordHashtags(postText, 6);
    if (keywordSuggestions.length > 0) return keywordSuggestions;
    return trendingHashtags.slice(0, 6).map((item) => item.tag);
  }, [postText, postVisibility, trendingHashtags]);

  const filteredFeed = useMemo(() => {
    const query = communityQuery.trim().toLowerCase();
    if (!query) return feed;
    return feed.filter((post) => {
      const hashtags = extractHashtagsFromText(post.content).map((item) => `#${item}`);
      const haystack = [displayUserName(post, ''), post.username, post.type, post.content, ...hashtags].filter(Boolean).join(' ').toLowerCase();
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

  useEffect(() => {
    if (!communityNotificationsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!communityNotificationsRef.current?.contains(event.target as Node)) {
        setCommunityNotificationsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCommunityNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [communityNotificationsOpen]);

  useEffect(() => {
    if (!locationPickerOpen) return;

    const query = locationSearchQuery.trim();
    if (query.length < 2) {
      setLocationSearchLoading(false);
      setLocationSearchResults([]);
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setLocationSearchLoading(true);
          const results = await searchLocations(query);
          setLocationSearchResults(results);
        } catch (err: any) {
          setError(err.message || 'Failed to search locations.');
          setLocationSearchResults([]);
        } finally {
          setLocationSearchLoading(false);
        }
      })();
    }, 220);

    return () => window.clearTimeout(timer);
  }, [locationPickerOpen, locationSearchQuery]);

  const filteredLeaderboard = useMemo(() => {
    const query = leaderboardQuery.trim().toLowerCase();
    if (!query) return leaderboard;
    return leaderboard.filter((entry) => displayUserName(entry, entry.username).toLowerCase().includes(query));
  }, [leaderboard, leaderboardQuery]);

  const hasInlineCoachReveal = useMemo(
    () => Object.keys(animatedCoachReplies).length > 0,
    [animatedCoachReplies],
  );
  const composerTooLong = composer.length > MAX_CHAT_MESSAGE_CHARACTERS;

  const typingIndicatorState = useMemo(() => {
    const ids = Object.entries(typingUsers)
      .filter(([, value]) => value)
      .map(([userId]) => userId)
      .filter((userId) => userId !== String(authUserId))
      .filter((userId) => !hasInlineCoachReveal || (userId !== 'coach' && userId !== '0'));

    if (ids.length === 0) return null;

    const activeCoachId = resolveConversationCoachId(activeConversation, selectedCoach);
    const coachTone = coachAvatarTheme(activeCoachId);
    const entries = Array.from(new Map(ids.map((userId) => {
      if (userId === 'coach' || userId === '0') {
        const coachName = activeConversation?.type === 'coach'
          ? (activeConversation.name.toLowerCase().includes('lc') ? 'LC' : 'ZJ')
          : activeCoachId.toUpperCase();
        return [userId, {
          userId,
          name: coachName,
          avatarText: avatarInitial(coachName),
          avatarUrl: '',
          background: coachTone.background,
          color: coachTone.text,
        }];
      }

      const numericId = Number(userId);
      const groupMember = Number.isFinite(numericId)
        ? activeGroupMembers.find((member) => member.id === numericId)
        : null;
      const messageName = Number.isFinite(numericId)
        ? displayUserName([...messages].reverse().find((message) => message.from_user_id === numericId), '')
        : '';
      const name = displayUserName(groupMember, '')
        || messageName
        || (activeConversation?.type === 'dm' ? activeConversation.name : 'Someone');
      const avatarUrl = groupMember?.avatar_url
        || (activeConversation?.type === 'dm' ? activeConversation.avatarUrl || '' : '');
      return [userId, {
        userId,
        name,
        avatarText: avatarInitial(name),
        avatarUrl,
        background: 'rgba(148,163,184,0.16)',
        color: 'rgb(71 85 105)',
      }];
    })).values());

    if (entries.length === 0) return null;

    const names = entries.map((entry) => entry.name);
    const label = names.length === 1
      ? `${names[0]} is typing...`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing...`
        : `${names[0]} and ${names.length - 1} others are typing...`;

    return {
      label,
      primary: entries[0],
    };
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

    if (tab === 'calendar') {
      return {
        kicker: 'Daily Record',
        title: 'See the whole day without opening coach menus',
        subtitle: 'Progress, meals, training, and Apple Health sync now live in one calendar view.',
        stats: [
          { label: 'Active coaches', value: String(enabledCoaches.length) },
          { label: 'Connections', value: String(friends.length) },
          { label: 'History', value: '120d' },
        ],
      };
    }

    return {
      kicker: 'Identity + Security',
      title: 'Own your profile footprint',
      subtitle: 'Manage your profile presence, coach chats, and active sessions in one place.',
      stats: [
        { label: 'Coach chats', value: String(enabledCoaches.length) },
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
    enabledCoaches.length,
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

  const handleWelcomeComplete = (coach: 'zj' | 'lc') => {
    setAuthSelectedCoach(coach);
    if (selectedCoachRef.current !== coach) {
      window.location.replace(buildAppUrl(tab, 'done'));
      return;
    }
    setSelectedCoach(coach);
    selectedCoachRef.current = coach;
    setWelcomeFlowOpen(false);
    showNotice('Coach profile saved.');
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
    window.location.replace(buildAppUrl(tab));
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

      void loadInbox(authUserIdRef.current, friendsRef.current);
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
      void loadInbox(authUserIdRef.current, friendsRef.current);
      void loadActivityNotifications(authUserIdRef.current);
      void loadMentions(authUserIdRef.current);
      return;
    }

    if (event.type === 'friends_updated') {
      void loadFriendsData(authUserIdRef.current)
        .then((rows) => loadInbox(authUserIdRef.current, rows))
        .catch(() => undefined);
    }
  };

  const bootstrap = async () => {
    const auth = getAuth();
    if (!auth) {
      router.replace('/login');
      return;
    }

    const bootstrapCoach = auth.selectedCoach || 'zj';
    const params = new URLSearchParams(window.location.search);
    const suppressWelcome = params.get('welcome') === 'done';
    requestedTopicRef.current = String(params.get('topic') || '').trim();
    if (suppressWelcome) {
      params.delete('welcome');
      const nextSearch = params.toString();
      window.history.replaceState({}, '', nextSearch ? `/app?${nextSearch}` : '/app');
    }

    setAuthUserId(auth.userId);
    setAuthUsername(displayUserName({ username: auth.username, display_name: auth.display_name }, auth.username || 'User'));
    setAuthSelectedCoach(auth.selectedCoach);
    setSelectedCoach(bootstrapCoach);
    selectedCoachRef.current = bootstrapCoach;
    messageDraftsRef.current = loadMessageDrafts(auth.userId);
    setEnabledCoaches(Array.isArray(auth.enabledCoaches) ? auth.enabledCoaches.filter((item): item is CoachId => item === 'zj' || item === 'lc') : []);
    setConversations([]);
    setActiveTopic('');
    setComposer('');
    setPostText(loadPostDraft(auth.userId));
    setMessageBubbleThemeId(loadBubbleThemeId(auth.userId));

    setTab(normalizeTabKey(params.get('tab')));

    const client = new RealtimeClient();
    client.connect(auth.token);
    client.onEvent(handleSocketEvent);
    realtimeRef.current = client;

    setReady(true);
    setWelcomeFlowOpen(!suppressWelcome);

    const initialFriends = await loadFriendsData(auth.userId);
    await Promise.all([
      loadInbox(auth.userId, initialFriends),
      loadFeed(auth.userId),
      loadLeaderboard(auth.userId),
      loadProfile(auth.userId),
      loadActivityNotifications(auth.userId),
      loadNotificationPreferences(auth.userId),
      loadAuthSessions(),
      loadSecurityEvents(auth.userId),
      loadAbuseReports(auth.userId),
      loadConnectInfo(auth.userId),
      loadMentions(auth.userId),
      loadStoredLocation(auth.userId),
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
    if (!authUserId) return;
    persistBubbleThemeId(authUserId, messageBubbleThemeId);
  }, [authUserId, messageBubbleThemeId]);

  useEffect(() => {
    const onAuthExpired = () => forceReauth('Invalid or expired token.');
    window.addEventListener('zym-auth-expired', onAuthExpired as EventListener);
    return () => window.removeEventListener('zym-auth-expired', onAuthExpired as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const relevantAuthKeys = new Set(['token', 'refreshToken', 'userId', 'username', 'displayName', 'selectedCoach']);
    const checkStoredAuth = (message = 'Session changed in another tab. Reloading...') => {
      const currentUserId = authUserIdRef.current;
      if (!currentUserId) return;

      const auth = getAuth();
      if (!auth) {
        forceReauth('Signed out in another tab.');
        return;
      }

      const effectiveStoredCoach = auth.selectedCoach || selectedCoachRef.current;
      if (auth.userId !== currentUserId || effectiveStoredCoach !== selectedCoachRef.current) {
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
    if (!conversationSettingsOpen) return;
    if (!activeConversation || activeConversation.topic !== conversationNotificationPreference?.topic) {
      setConversationSettingsOpen(false);
    }
  }, [activeConversation, conversationNotificationPreference?.topic, conversationSettingsOpen]);

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
    setPostLocation(null);
    setSharedLocation(null);
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
    if (!activeTopic) return;
    if (skipTypingPulseRef.current) {
      skipTypingPulseRef.current = false;
      return;
    }
    const shouldTyping = composer.trim().length > 0;
    realtimeRef.current?.typing(activeTopic, shouldTyping);

    return () => {
      realtimeRef.current?.typing(activeTopic, false);
    };
  }, [composer, activeTopic]);

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

  async function loadInbox(userId = authUserIdRef.current, friendSource?: Friend[]) {
    if (!userId) return;

    try {
      const inbox = await getInbox(userId);
      const sourceFriends = friendSource || friendsRef.current;
      const coachRows = Array.isArray(inbox.coaches) ? inbox.coaches : (inbox.coach ? [inbox.coach] : []);
      const enabledCoachIds = coachRows
        .map((item) => normalizeCoachId(item.coach_id))
        .filter((item): item is CoachId => Boolean(item));
      setEnabledCoaches(enabledCoachIds);

      const dmTopics = new Set(inbox.dms.map((item) => item.topic));
      const friendPlaceholders: Conversation[] = sourceFriends
        .map((friend) => ({
          topic: buildP2PTopic(userId, friend.id),
          name: displayUserName(friend, friend.username),
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
        ...coachRows.map((item) => ({
          topic: item.topic,
          name: item.coach_name || coachDisplayName((normalizeCoachId(item.coach_id) || 'zj')),
          type: 'coach' as const,
          subtitle: 'AI Coach',
          preview: item.last_message_preview,
          unreadCount: Number(item.unread_count || 0),
          mentionCount: Number(item.mention_count || 0),
          avatarUrl: null,
          userId: 0,
          coachId: normalizeCoachId(item.coach_id) || 'zj',
        })),
        ...inbox.dms.map((item) => ({
          topic: item.topic,
          name: displayUserName(item, item.username),
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
      const requestedTopic = requestedTopicRef.current;
      if (requestedTopic && list.some((item) => item.topic === requestedTopic)) {
        setTab('messages');
        setActiveTopic(requestedTopic);
        setMobileConversationListOpen(false);
        requestedTopicRef.current = '';
      } else if (!activeTopicRef.current || !list.some((item) => item.topic === activeTopicRef.current)) {
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

  async function loadActivityNotifications(userId = authUserId) {
    if (!userId) return;

    try {
      setActivityNotificationsLoading(true);
      const rows = await getActivityNotifications(userId);
      setActivityNotifications(rows);
    } catch (err: any) {
      setError(err.message || 'Failed to load notifications.');
    } finally {
      setActivityNotificationsLoading(false);
    }
  }

  async function loadStoredLocation(userId = authUserId) {
    if (!userId) return;

    try {
      const location = await getStoredLocation(userId);
      setSharedLocation(location);
    } catch (err: any) {
      setError(err.message || 'Failed to load location.');
    }
  }

  async function loadNotificationPreferences(userId = authUserId) {
    if (!userId) return;

    try {
      const result = await getNotificationPreferences(userId);
      setNotificationPreferences(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load notification settings.');
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
        display_name: displayUserName(result, authUsername || 'User'),
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
    if (composerTooLong) {
      setError(`Message is too long to send. Keep it under ${MAX_CHAT_MESSAGE_CHARACTERS.toLocaleString()} characters.`);
      return;
    }
    if (pendingSend || !activeTopic || (!composer.trim() && attachments.length === 0)) return;

    const optimisticId = -Date.now();
    const clientMessageId = createClientMessageId();
    const text = composer.trim();
    const filesToUpload = attachments;

    try {
      setPendingSend(true);
      setComposer('');
      setAttachments([]);
      setComposerActionsOpen(false);

      const uploadedMedia = filesToUpload.length > 0
        ? await Promise.all(filesToUpload.map((file) => uploadFile(file, {
            source: 'web_message',
            visibility: 'private',
          })))
        : [];
      const uploadedUrls = uploadedMedia.map((item) => item.url);
      const uploadedMediaIds = uploadedMedia
        .map((item) => item.mediaId)
        .filter((item): item is string => Boolean(item));
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
      setComposer((current) => (current.trim() ? current : text));
      setAttachments((current) => (current.length > 0 ? current : filesToUpload));
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
      showNotice(`Friend request sent to ${displayUserName(user, user.username)}.`);
      setFriendQuery('');
      setFriendSearchResult([]);
      const rows = await loadFriendsData();
      await loadInbox(authUserId, rows);
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
      await loadInbox(authUserId, rows);
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
      await loadInbox(authUserId, rows);
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
      showNotice(`Invited ${displayUserName(candidate, candidate.username)}.`);
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
      showNotice(`Removed ${displayUserName(member, member.username)}.`);
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
        location: postLocation,
      });

      setPostText('');
      setPostFiles([]);
      setPostVisibility('friends');
      setPostLocation(null);
      setCommunityComposerOpen(false);
      showNotice('Post published.');
      await loadFeed();
    } catch (err: any) {
      setError(err.message || 'Failed to publish post.');
    } finally {
      setPostPending(false);
    }
  }

  function openLocationPicker() {
    setLocationPickerOpen(true);
    setLocationSearchQuery('');
    setLocationSearchResults([]);
    setLocationSearchLoading(false);
    setLocationPickerPending(false);
  }

  function closeLocationPicker() {
    setLocationPickerOpen(false);
    setLocationSearchQuery('');
    setLocationSearchResults([]);
    setLocationSearchLoading(false);
    setLocationPickerPending(false);
  }

  async function applyLocationSelection(selection: LocationSelection) {
    try {
      setLocationPickerPending(true);
      setPostLocation(selection);
      showNotice(`Post location set to ${selection.label}.`);
      closeLocationPicker();
    } catch (err: any) {
      setError(err.message || 'Failed to save location.');
    } finally {
      setLocationPickerPending(false);
    }
  }

  async function handleUseBrowserLocation(precision: 'city' | 'precise') {
    if (typeof window === 'undefined' || !window.navigator.geolocation) {
      setError('Location is not supported in this browser.');
      return;
    }

    try {
      setLocationPickerPending(true);
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        window.navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: precision === 'precise',
          timeout: 12_000,
          maximumAge: 120_000,
        });
      });
      const reversed = await reverseLocation(position.coords.latitude, position.coords.longitude);
      const selection = precision === 'city' ? reversed.city : reversed.precise;
      if (!selection) {
        throw new Error('Unable to resolve this location yet.');
      }
      await applyLocationSelection(selection);
    } catch (err: any) {
      if (err?.code === 1) {
        setError('Location permission was denied.');
      } else {
        setError(err.message || 'Failed to use your current location.');
      }
      setLocationPickerPending(false);
    }
  }

  async function handleReact(postId: number) {
    const snapshot = feed.find((post) => post.id === postId);
    if (!snapshot || reactingPostIdsRef.current.has(postId)) return;

    const optimisticReacted = !snapshot.viewer_has_liked;
    const optimisticReactionCount = Math.max(0, Number(snapshot.reaction_count || 0) + (optimisticReacted ? 1 : -1));

    try {
      reactingPostIdsRef.current.add(postId);
      setReactingPostIds((prev) => [...prev, postId]);
      setFeed((prev) => prev.map((post) => (
        post.id === postId
          ? {
            ...post,
            viewer_has_liked: optimisticReacted,
            reaction_count: optimisticReactionCount,
          }
          : post
      )));

      const response = await reactToPost(postId, authUserId, 'like');
      setFeed((prev) => prev.map((post) => (
        post.id === postId
          ? {
            ...post,
            viewer_has_liked: response.reacted,
            reaction_count: response.reactionCount,
          }
          : post
      )));
    } catch (err: any) {
      setFeed((prev) => prev.map((post) => (
        post.id === postId
          ? {
            ...post,
            viewer_has_liked: snapshot.viewer_has_liked,
            reaction_count: snapshot.reaction_count,
          }
          : post
      )));
      setError(err.message || 'Failed to react to post.');
    } finally {
      reactingPostIdsRef.current.delete(postId);
      setReactingPostIds((prev) => prev.filter((id) => id !== postId));
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
    setCommunityNotificationsOpen(false);
    if (!topic) return;

    if (topic.startsWith('post_')) {
      const postId = Number(topic.replace('post_', ''));
      if (Number.isInteger(postId) && postId > 0) {
        setTab('community');
        setCommunityNotificationsOpen(false);
        setExpandedPostIds((prev) => (prev.includes(postId) ? prev : [...prev, postId]));
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

  async function handleOpenActivityNotification(notification: ActivityNotification) {
    try {
      await markActivityNotificationsRead({ userId: authUserId, ids: [notification.id] });
      setActivityNotifications((prev) => prev.map((item) => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )));
    } catch {
      // Best effort only.
    }

    setCommunityNotificationsOpen(false);

    if (notification.source_type === 'message' && notification.topic) {
      setTab('messages');
      setConversationSettingsOpen(false);
      setActiveTopic(notification.topic);
      return;
    }

    if (notification.post_id) {
      setTab('community');
      setExpandedPostIds((prev) => (prev.includes(notification.post_id as number) ? prev : [...prev, notification.post_id as number]));
      if (notification.source_type === 'post_comment') {
        setExpandedCommentPostIds((prev) => (
          prev.includes(notification.post_id as number) ? prev : [...prev, notification.post_id as number]
        ));
        await loadPostComments(notification.post_id);
      }
    }
  }

  async function handleMarkAllActivityNotificationsRead() {
    try {
      await markActivityNotificationsRead({ userId: authUserId });
      setActivityNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch (err: any) {
      setError(err.message || 'Failed to mark notifications as read.');
    }
  }

  async function handleOpenCommunityNotification(entry: CommunityNotificationEntry) {
    if (entry.kind === 'mention' && entry.mention) {
      await handleOpenMention(entry.mention);
      return;
    }
    if (entry.activity) {
      await handleOpenActivityNotification(entry.activity);
    }
  }

  async function handleMarkAllCommunityNotificationsRead() {
    try {
      const tasks: Promise<void>[] = [];
      if (unreadActivityNotificationCount > 0) {
        tasks.push(markActivityNotificationsRead({ userId: authUserId }));
      }
      if (unreadMentionCount > 0) {
        tasks.push(markMentionNotificationsRead({ userId: authUserId }));
      }
      await Promise.all(tasks);
      setActivityNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setMentionNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch (err: any) {
      setError(err.message || 'Failed to mark notifications as read.');
    }
  }

  async function handleUpdateNotificationPreferences(patch: Partial<NotificationPreferences>) {
    try {
      setNotificationPreferencesPending(true);
      const next = await updateNotificationPreferences({
        userId: authUserId,
        messageNotificationsEnabled: patch.messageNotificationsEnabled,
        postNotificationsEnabled: patch.postNotificationsEnabled,
      });
      setNotificationPreferences(next);
      showNotice('Notification settings updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to update notification settings.');
    } finally {
      setNotificationPreferencesPending(false);
    }
  }

  async function openConversationSettings() {
    if (!activeConversation || !authUserId) return;

    setConversationSettingsOpen(true);
    setConversationSettingsLoading(true);
    setConversationNotificationPreference({
      topic: activeConversation.topic,
      muted: false,
    });

    try {
      const result = await getConversationNotificationPreference(authUserId, activeConversation.topic);
      setConversationNotificationPreference(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load conversation settings.');
    } finally {
      setConversationSettingsLoading(false);
    }
  }

  async function handleUpdateConversationNotificationPreference(nextMuted: boolean) {
    if (!activeConversation || !authUserId) return;

    try {
      setConversationSettingsPending(true);
      const result = await updateConversationNotificationPreference({
        userId: authUserId,
        topic: activeConversation.topic,
        muted: nextMuted,
      });
      setConversationNotificationPreference(result);
      showNotice(nextMuted ? 'This chat is muted.' : 'This chat will notify again.');
    } catch (err: any) {
      setError(err.message || 'Failed to update chat notification settings.');
    } finally {
      setConversationSettingsPending(false);
    }
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
        display_name: profileDraft.display_name,
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
        await loadInbox(authUserId, nextFriends);
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

  async function handleEnableCoach(coach: CoachId) {
    const alreadyEnabled = enabledCoaches.includes(coach);
    try {
      const response = await enableCoach(authUserId, coach);
      setEnabledCoaches(response.enabledCoaches);
      if (response.selectedCoach) {
        setSelectedCoach(response.selectedCoach);
        selectedCoachRef.current = response.selectedCoach;
      }
      await loadInbox(authUserId);
      setCoachPickerOpen(false);
      setCommunityActionsOpen(false);
      setTab('messages');
      setActiveTopic(buildCoachTopic(authUserId, coach));
      showNotice(alreadyEnabled ? `${coachDisplayName(coach)} opened.` : `${coachDisplayName(coach)} added to chats.`);
    } catch (err: any) {
      setError(err.message || 'Failed to enable coach.');
    }
  }

  function closeProfileViewer() {
    setProfileViewerActionPending(false);
    setProfileViewer((prev) => ({ ...prev, open: false }));
    if (profileViewer.surface === 'message-pane' && !activeConversation && !isWideMessageLayout) {
      setMobileConversationListOpen(true);
    }
  }

  async function openConversationProfile() {
    if (!activeConversation) return;

    if (activeConversation.type === 'coach') {
      setProfileViewer({
        open: true,
        loading: false,
        surface: 'message-pane',
        type: 'coach',
        coachId: activeConversation.coachId || activeConversationCoach,
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
      surface: 'message-pane',
      type: 'user',
      userId: targetUserId,
      data: null,
    });
    setProfileViewerActionPending(false);

    try {
      const data = await getPublicProfile(targetUserId);
      setProfileViewer({
        open: true,
        loading: false,
        surface: 'message-pane',
        type: 'user',
        userId: targetUserId,
        data,
      });
    } catch (err: any) {
      setProfileViewer((prev) => ({ ...prev, loading: false, data: null }));
      setError(err.message || 'Failed to load profile.');
    }
  }

  async function openPublicProfile(targetUserId: number, surface: ProfileViewerState['surface'] = 'content-page') {
    if (!targetUserId) return;

    setProfileViewer({
      open: true,
      loading: true,
      surface,
      type: 'user',
      userId: targetUserId,
      data: null,
    });
    setProfileViewerActionPending(false);

    try {
      const data = await getPublicProfile(targetUserId);
      setProfileViewer({
        open: true,
        loading: false,
        surface,
        type: 'user',
        userId: targetUserId,
        data,
      });
    } catch (err: any) {
      setProfileViewer((prev) => ({ ...prev, loading: false, data: null }));
      setError(err.message || 'Failed to load profile.');
    }
  }

  function profileViewerPrimaryActionLabel(): string | null {
    const status = profileViewer.data?.friendship_status;
    const targetUserId = profileViewer.data?.profile?.id || 0;
    if (!status || !targetUserId || targetUserId === authUserId) return null;
    if (status === 'accepted') return 'Send Message';
    if (status === 'none') return 'Add as Friend';
    if (status === 'incoming_pending') return 'Accept Invitation';
    if (status === 'outgoing_pending' || status === 'pending') return 'Pending';
    return null;
  }

  function profileViewerPrimaryActionEnabled(): boolean {
    const status = profileViewer.data?.friendship_status;
    const targetUserId = profileViewer.data?.profile?.id || 0;
    if (!status || !targetUserId || targetUserId === authUserId || profileViewerActionPending) return false;
    return status === 'accepted' || status === 'none' || status === 'incoming_pending';
  }

  async function handleProfileViewerPrimaryAction() {
    const viewedProfile = profileViewer.data?.profile;
    const status = profileViewer.data?.friendship_status;
    if (!viewedProfile || !status || viewedProfile.id === authUserId || profileViewerActionPending) return;

    try {
      setProfileViewerActionPending(true);
      if (status === 'accepted') {
        const topic = await openDM(authUserId, viewedProfile.id);
        requestedTopicRef.current = topic;
        setTab('messages');
        setActiveTopic(topic);
        setMobileConversationListOpen(false);
        closeProfileViewer();
        await loadInbox(authUserId, friendsRef.current);
        return;
      }

      if (status === 'none') {
        await addFriend({ userId: authUserId, friendId: viewedProfile.id });
        setProfileViewer((prev) => (
          prev.data
            ? {
              ...prev,
              data: {
                ...prev.data,
                friendship_status: 'outgoing_pending',
                isFriend: false,
              },
            }
            : prev
        ));
        showNotice(`Friend request sent to ${displayUserName(viewedProfile, viewedProfile.username)}.`);
        return;
      }

      if (status === 'incoming_pending') {
        await acceptFriend(authUserId, viewedProfile.id);
        setProfileViewer((prev) => (
          prev.data
            ? {
              ...prev,
              data: {
                ...prev.data,
                friendship_status: 'accepted',
                isFriend: true,
              },
            }
            : prev
        ));
        showNotice(`Friend request from ${displayUserName(viewedProfile, viewedProfile.username)} accepted.`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update profile action.');
    } finally {
      setProfileViewerActionPending(false);
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
  const activeCoachAvatarTone = coachAvatarTheme(activeConversationCoach);
  const activeConversationTheme = coachTheme(activeConversationCoach);
  const selectedCoachTheme = coachTheme(selectedCoach);
  const selectedCoachButtonClass = coachButtonClass(selectedCoach);
  const activeConversationButtonClass = coachButtonClass(activeConversation?.type === 'group'
    ? normalizeCoachId(activeConversation.coachEnabled)
    : activeConversationCoach);
  const createGroupButtonClass = groupCoachEnabled === 'none' ? 'btn btn-ghost' : coachButtonClass(groupCoachEnabled);
  const selectedTabLabel = tabs.find((item) => item.key === activeTab)?.label || 'Message';
  const showingMessageProfilePane = profileViewer.open && profileViewer.surface === 'message-pane';

  useEffect(() => {
    if (lastVisibleTabRef.current === activeTab) return;
    lastVisibleTabRef.current = activeTab;
    setProfileViewer((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, [activeTab]);

  const topLeaderboardMetric = Math.max(
    ...filteredLeaderboard.map((entry) => (
      leaderboardMetric === 'steps'
        ? Number(entry.steps || 0)
        : Number(entry.calories_burned || 0)
    )),
    1,
  );

  const renderAppHeader = (
    title: string,
    subtitle: string,
    searchValue?: string,
    onSearchChange?: (value: string) => void,
    searchPlaceholder?: string,
    searchRef?: { current: HTMLInputElement | null },
    searchSuggestions?: string[],
    onSearchSuggestionSelect?: (value: string) => void,
    trailing?: JSX.Element,
  ) => (
    <header className="relative z-20 flex flex-col gap-2.5 border-b border-slate-200/50 bg-white/20 px-4 py-2.5 backdrop-blur-sm sm:gap-4 sm:px-5 sm:py-3 md:flex-row md:items-center md:justify-between md:px-8">
      <div>
        <h1 className="text-[1.3rem] font-semibold tracking-tight text-slate-900 sm:text-[1.9rem] md:text-[2.15rem]">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="flex flex-col gap-2.5 sm:gap-3 md:flex-row md:items-center">
        {onSearchChange ? (
          <label className="relative block w-full min-w-0 md:min-w-[280px]">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 16 }}>search</span>
            <input
              ref={searchRef}
              className="w-full rounded-full border border-transparent bg-slate-100/85 py-2 pl-8 pr-3 text-[13px] text-slate-700 outline-none transition focus:bg-white sm:pl-9 sm:pr-4 sm:text-sm"
              style={{
                borderColor: 'transparent',
                boxShadow: 'none',
              }}
              value={searchValue || ''}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder || 'Search'}
            />
            {searchSuggestions && searchSuggestions.length > 0 && onSearchSuggestionSelect ? (
              <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-[20px] bg-white/95 shadow-[0_16px_38px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                {searchSuggestions.slice(0, 5).map((suggestion, index) => (
                  <button
                    key={suggestion}
                    type="button"
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[13px] text-slate-700 transition hover:bg-slate-50 sm:text-sm ${
                      index !== 0 ? 'border-t border-slate-100' : ''
                    }`}
                    onClick={() => onSearchSuggestionSelect(suggestion)}
                  >
                    <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 16 }}>search</span>
                    <span>{suggestion}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
        ) : null}
        {trailing ? <div className="relative z-30 flex items-center gap-2">{trailing}</div> : null}
      </div>
    </header>
  );

  const renderMessagePage = () => {
    const showConversationList = isWideMessageLayout || mobileConversationListOpen || !activeConversation;
    const showConversationPane = isWideMessageLayout || !mobileConversationListOpen;
    const showChatListBackButton = !isWideMessageLayout;

    return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-2.5 border-b border-slate-200/50 bg-white/20 px-4 py-2.5 backdrop-blur-sm sm:gap-3 sm:px-5 sm:py-3 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[1.3rem] font-semibold tracking-tight text-slate-900 sm:text-[1.7rem] md:text-[2.15rem]">Message</h1>
          {!isWideMessageLayout ? (
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-[13px] sm:px-4 sm:py-2 sm:text-sm"
              onClick={() => setMobileConversationListOpen((prev) => !prev)}
            >
              {showConversationList ? 'Chat' : 'Chats'}
            </button>
          ) : null}
        </div>
        <label className="relative block w-full md:max-w-[320px]">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 16 }}>search</span>
          <input
            ref={conversationSearchRef}
            className="w-full rounded-full border border-transparent bg-slate-100/85 py-2 pl-8 pr-3 text-[13px] text-slate-700 outline-none transition focus:bg-white sm:pl-9 sm:pr-4 sm:text-sm"
            style={{ borderColor: 'transparent' }}
            value={conversationQuery}
            onChange={(event) => setConversationQuery(event.target.value)}
            placeholder="Search conversation..."
          />
        </label>
      </header>

	      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:gap-4 sm:p-4 md:p-6 xl:flex-row xl:gap-6">
        <section className={`${showConversationList ? 'flex' : 'hidden'} w-full min-h-0 flex-col gap-2.5 sm:gap-3 xl:flex xl:w-[320px]`}>
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-[18px] bg-white/72 px-3 py-2.5 text-[13px] font-semibold shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition hover:bg-white/90 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm"
            style={{
              color: selectedCoachTheme.ink,
            }}
            onClick={openCreateGroupDialog}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            Create Group
          </button>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1 sm:gap-3">
            {filteredConversations.length === 0 ? (
              <div className="rounded-[22px] bg-slate-100/70 p-4 text-[13px] text-slate-500 sm:rounded-[28px] sm:p-5 sm:text-sm">
                No conversations matched this search.
              </div>
            ) : null}
            {filteredConversations.map((conversation) => (
              <ConversationTile
                key={conversation.topic}
                item={conversation}
                active={activeTopic === conversation.topic}
                onOpenProfile={(userId) => {
                  if (!isWideMessageLayout) {
                    setMobileConversationListOpen(false);
                  }
                  void openPublicProfile(userId, 'message-pane');
                }}
                onSelect={(topic) => {
                  setActiveTopic(topic);
                  if (!isWideMessageLayout) {
                    setMobileConversationListOpen(false);
                  }
                }}
                resolveAssetUrl={resolveApiAssetUrl}
                displayNameFromTopic={displayNameFromTopic}
                avatarInitial={avatarInitial}
              />
            ))}
          </div>
        </section>

	        <section className={`${showConversationPane ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col rounded-[26px] bg-white/40 backdrop-blur-2xl sm:rounded-[32px] xl:flex`}>
            {!showingMessageProfilePane ? (
	          <header className="flex items-center justify-between gap-2.5 rounded-t-[26px] bg-white/22 px-3.5 py-2.5 sm:gap-3 sm:rounded-t-[32px] sm:px-5 sm:py-3 md:px-6">
	            {conversationSettingsOpen ? (
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-white/80 text-slate-500 transition hover:bg-white sm:size-10 sm:rounded-[14px]"
                    onClick={() => setConversationSettingsOpen(false)}
                    aria-label="Back to chat"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                  </button>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px]">Settings</p>
                    <h2 className="truncate text-[1.05rem] font-bold text-slate-900 sm:text-xl">
                      {activeConversation?.name || 'Chat'}
                    </h2>
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                  {showChatListBackButton ? (
                    <button
                      type="button"
                      className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-white/80 text-slate-500 transition hover:bg-white sm:size-10 sm:rounded-[14px]"
                      onClick={() => setMobileConversationListOpen(true)}
                      aria-label="Back to chats"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="flex size-9 shrink-0 items-center justify-center rounded-[12px] sm:size-10 sm:rounded-[14px]"
                    style={{
                      background: activeConversation?.type === 'coach'
                        ? activeCoachAvatarTone.background
                        : 'rgba(255,255,255,0.75)',
                      color: activeConversation?.type === 'coach' ? activeCoachAvatarTone.text : neutralTheme.ink,
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
                        style={{
                          width: isWideMessageLayout ? 40 : 34,
                          height: isWideMessageLayout ? 40 : 34,
                          borderRadius: isWideMessageLayout ? 14 : 12,
                          objectFit: 'cover',
                        }}
                      />
                    ) : activeConversation?.type === 'coach' ? (
                      <CoachAvatar coach={activeConversationCoach} state="selected" size={isWideMessageLayout ? 40 : 34} />
                    ) : (
                      <span className="text-sm font-semibold sm:text-base">{avatarInitial(activeConversation?.name || 'Chat')}</span>
                    )}
                  </button>
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-[1.05rem] font-bold text-slate-900 sm:text-xl">
                        {activeConversation?.name || 'Select a chat'}
                      </h2>
                    </div>
                  </div>
                </div>
              )}

            {!conversationSettingsOpen && activeConversation ? (
              <button
                type="button"
                className="flex size-9 shrink-0 items-center justify-center rounded-[12px] text-slate-500 transition hover:bg-slate-100/85 sm:size-10"
                aria-label="Open chat settings"
                onClick={() => void openConversationSettings()}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>more_horiz</span>
              </button>
            ) : null}
          </header>
            ) : null}

          {showingMessageProfilePane ? (
            renderProfileViewerPage('message-pane')
          ) : conversationSettingsOpen ? (
            <div className="flex-1 overflow-y-auto px-3.5 py-4 sm:px-5 sm:py-5 md:px-6">
              <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
                <section className="rounded-[24px] bg-white/78 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.06)] sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Notifications</p>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900 sm:text-xl">Control this chat’s alerts</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Keep the conversation in your inbox, but decide whether new messages from this thread should reach your notification feed.
                  </p>
                  <div className="mt-5 flex items-center justify-between gap-4 rounded-[20px] bg-slate-50/85 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Chat notifications</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {conversationNotificationPreference?.muted
                          ? 'Muted for this conversation only.'
                          : 'You will be notified when this chat gets a new message.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                        conversationNotificationPreference?.muted
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-slate-900 text-white'
                      }`}
                      disabled={conversationSettingsLoading || conversationSettingsPending}
                      onClick={() => void handleUpdateConversationNotificationPreference(!(conversationNotificationPreference?.muted))}
                    >
                      {conversationSettingsLoading
                        ? 'Loading'
                        : conversationSettingsPending
                          ? 'Saving'
                          : conversationNotificationPreference?.muted
                            ? 'Muted'
                            : 'Notify'}
                    </button>
                  </div>
                </section>

                {activeConversation?.type === 'group' ? (
                  <section className="rounded-[24px] bg-white/72 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)] sm:p-5">
                    <h4 className="text-base font-semibold text-slate-900">Group tools</h4>
                    <p className="mt-1 text-sm text-slate-500">Member management stays available here while notifications live in the same settings flow.</p>
                    <button
                      type="button"
                      className="btn btn-ghost mt-4"
                      onClick={() => {
                        setConversationSettingsOpen(false);
                        setGroupSettingsOpen(true);
                      }}
                    >
                      Manage group members
                    </button>
                  </section>
                ) : null}
              </div>
            </div>
          ) : (
            <>
            <div ref={chatStreamRef} className="flex-1 overflow-y-auto px-3.5 py-3.5 sm:px-5 sm:py-5 md:px-6">
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
                    : displayUserName(message, activeConversation?.type === 'coach' ? coachDisplayName(activeConversationCoach) : 'User');
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
                    <div key={`${message.id}-${message.created_at}`} className="mb-3.5 sm:mb-5">
                      {showDateDivider ? (
                        <div className="mb-3 flex items-center gap-3 py-1.5 sm:mb-4 sm:gap-4 sm:py-2">
                          <div className="h-px flex-1 bg-slate-200/60" />
                          <span className="text-[9px] font-bold uppercase tracking-[0.26em] text-slate-400 sm:text-[10px] sm:tracking-[0.3em]">{formatDayLabel(message.created_at)}</span>
                          <div className="h-px flex-1 bg-slate-200/60" />
                        </div>
                      ) : null}

                      <div className={`flex gap-2.5 sm:gap-3 ${mine ? 'justify-end' : 'justify-start'} ${compact ? 'mt-1.5 sm:mt-2' : ''}`}>
                        {!mine ? (
                      <MessageAvatarBadge
                        avatarUrl={counterpartyAvatarUrl}
                        label={avatarText}
                        background={message.is_coach ? activeCoachAvatarTone.background : 'rgba(148,163,184,0.16)'}
                        color={message.is_coach ? activeCoachAvatarTone.text : 'rgb(71 85 105)'}
                        coachId={message.is_coach ? activeConversationCoach : null}
                        hidden={compact}
                        onClick={!compact && !message.is_coach && message.from_user_id > 0
                          ? () => {
                            void openPublicProfile(message.from_user_id, 'message-pane');
                          }
                          : undefined}
                        interactiveLabel={!message.is_coach ? `Open ${counterpartyName} profile` : undefined}
                      />
                        ) : null}

                        <article className={`max-w-[88%] sm:max-w-[82%] ${mine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                          {showMetaLine ? (
                            <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-400 sm:gap-2 sm:text-[11px] sm:tracking-[0.2em] ${mine ? 'justify-end' : 'justify-start'}`}>
                              {senderMetaLabel ? (
                                <strong
                                  className="font-semibold"
                                  style={{ color: 'var(--ink-500)' }}
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
                                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-[18px] bg-white/92 shadow-[0_12px_28px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 sm:h-32 sm:w-32 sm:rounded-[22px] md:h-36 md:w-36"
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
                              className={`rounded-[18px] px-3 py-2.5 shadow-sm sm:rounded-[22px] sm:px-4 sm:py-3 ${
                                mine
                                  ? 'rounded-tr-md'
                                  : 'rounded-tl-md'
                              } ${segmentIndex > 0 ? 'mt-2' : ''}`}
                              style={{
                                background: mine
                                  ? selectedMessageBubbleTheme.outgoingFill
                                  : selectedMessageBubbleTheme.incomingFill,
                                color: mine
                                  ? selectedMessageBubbleTheme.outgoingText
                                  : selectedMessageBubbleTheme.incomingText,
                                boxShadow: mine
                                  ? '0 10px 24px rgba(15,23,42,0.06)'
                                  : '0 12px 26px rgba(15,23,42,0.08)',
                              }}
                            >
                              {segment ? <p className="text-[13px] leading-5 sm:text-sm sm:leading-6">{renderMessageInlineLinks(segment)}</p> : null}
                            </div>
                          ))}

                          {isCoachReply && hasRemainingCoachSegments ? (
                            <TypingPill label={`${avatarText} is typing...`} className="mt-2" />
                          ) : null}
                        </article>
                      </div>
                    </div>
                  );
                })}

                {typingIndicatorState ? (
                  <div className="mt-4 flex justify-start">
                    <div className="flex gap-2.5 sm:gap-3">
                      <MessageAvatarBadge
                        avatarUrl={typingIndicatorState.primary.avatarUrl}
                        label={typingIndicatorState.primary.avatarText}
                        background={typingIndicatorState.primary.background}
                        color={typingIndicatorState.primary.color}
                      />
                      <TypingPill label={typingIndicatorState.label} />
                    </div>
                  </div>
                ) : null}

              </div>

            <footer className="chat-footer-safe border-t border-slate-200/40 bg-white/30 px-3 py-3 sm:px-5 sm:py-4 md:px-6">
                <MediaPreviewGrid
                  items={attachmentPreviews}
                  onRemove={(index) => removeAttachmentAt(index, setAttachments)}
                  wrapperClassName="chat-preview-grid"
                  itemClassName="chat-preview-item"
                  mediaHeight={isWideMessageLayout ? 128 : 96}
                  showVideoControls={false}
                />

	                <div className="mt-2.5 flex items-end gap-2 rounded-[22px] bg-white/82 p-2.5 shadow-[0_10px_28px_rgba(15,23,42,0.05)] sm:mt-3 sm:gap-3 sm:rounded-[26px] sm:p-3">
                  <div ref={composerMenuRef} className="relative">
                    <button
                      className="flex size-10 items-center justify-center rounded-[16px] bg-slate-100/90 text-slate-500 transition hover:bg-slate-200 sm:size-11 sm:rounded-2xl"
                      type="button"
                      onClick={() => setComposerActionsOpen((prev) => !prev)}
                      aria-label="Open attachment actions"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_circle</span>
                    </button>
                    {composerActionsOpen ? (
                      <div className="absolute bottom-[calc(100%+10px)] left-0 z-10 flex min-w-[220px] flex-col gap-2 rounded-[18px] bg-white/96 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.14)] sm:bottom-[calc(100%+12px)] sm:min-w-[240px] sm:rounded-[22px]">
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
	                    className="min-w-0 flex-1 rounded-[16px] border border-transparent bg-transparent px-1 py-2.5 text-[13px] leading-5 text-slate-700 outline-none placeholder:text-slate-400 sm:rounded-[18px] sm:px-2 sm:py-3 sm:text-sm"
	                    value={composer}
	                    onChange={(event) => setComposer(event.target.value)}
	                    placeholder="Type a message..."
	                    onKeyDown={(event) => {
	                      if (event.key === 'Enter' && !event.shiftKey && !composerTooLong) {
	                        event.preventDefault();
	                        void handleSendMessage();
	                      }
                    }}
                  />

                  <div className="flex shrink-0 items-center gap-2 self-auto sm:self-end">
                    {activeConversation?.type === 'group' && activeConversation.coachEnabled !== 'none' ? (
                      <button
                        className="btn btn-ghost px-3 py-2 text-[12px] sm:px-4 sm:text-sm"
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
	                      className="flex size-10 shrink-0 items-center justify-center rounded-[16px] bg-slate-100/90 text-slate-500 transition hover:bg-slate-200 sm:size-11 sm:rounded-2xl"
	                      disabled={pendingSend || !isOnline || composerTooLong}
	                      onClick={() => void handleSendMessage()}
	                    >
	                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>send</span>
                    </button>
                  </div>
                </div>

	                {attachments.length > 0 ? (
	                  <p className="mt-3 text-xs text-slate-500">
	                    {attachments.length}/{MAX_MEDIA_ATTACHMENTS} file(s) ready
	                  </p>
	                ) : null}
	                {composerTooLong ? (
	                  <p className="mt-1 text-xs text-[color:var(--danger)]">
	                    Message is too long to send. Keep it under {MAX_CHAT_MESSAGE_CHARACTERS.toLocaleString()} characters.
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
  };

  const renderProfileViewerPage = (surface: ProfileViewerState['surface']) => {
    const embedded = surface === 'message-pane';
    const viewerProfile = profileViewer.data?.profile;
    const viewerProfileName = displayUserName(viewerProfile, 'User');
    const viewerPosts = profileViewer.data?.recent_posts || [];
    const viewerHealth = profileViewer.data?.today_health;
    const primaryActionLabel = profileViewerPrimaryActionLabel();
    const primaryActionEnabled = profileViewerPrimaryActionEnabled();

    return (
      <div
        className={embedded
          ? 'flex h-full min-h-0 flex-col'
          : 'absolute inset-0 z-20 flex min-h-0 flex-col bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))] backdrop-blur-xl'}
      >
        <div className={`${embedded ? 'border-b border-slate-200/45 bg-white/22 px-3.5 py-2.5 sm:px-5 sm:py-3 md:px-6' : 'px-4 py-4 sm:px-6 sm:py-5'}`}>
          <div className="mx-auto flex w-full max-w-4xl items-center gap-3">
            <button
              type="button"
              className="flex size-9 shrink-0 items-center justify-center rounded-[14px] bg-white/82 text-slate-500 shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition hover:bg-white sm:size-10"
              onClick={closeProfileViewer}
              aria-label="Back"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-[11px]">Profile</p>
              <h2 className="truncate text-[1.02rem] font-semibold text-slate-900 sm:text-[1.2rem]">
                {profileViewer.type === 'coach'
                  ? coachDisplayName(profileViewer.coachId || 'zj')
                  : viewerProfileName}
              </h2>
            </div>
          </div>
        </div>

        <div className={`${embedded ? 'min-h-0 flex-1 overflow-y-auto px-3.5 py-4 sm:px-5 sm:py-5 md:px-6' : 'min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 sm:pb-8'}`}>
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 sm:gap-6">
            {profileViewer.loading ? (
              <div className="rounded-[28px] bg-white/66 px-5 py-8 text-sm text-slate-500 shadow-[0_20px_48px_rgba(15,23,42,0.05)]">
                Loading profile...
              </div>
            ) : null}

            {!profileViewer.loading && profileViewer.type === 'coach' ? (
              <section className="overflow-hidden rounded-[30px] bg-white/68 shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
                <div
                  className="px-5 py-10 sm:px-8"
                  style={{
                    background: `linear-gradient(135deg, ${coachTheme((profileViewer.coachId || 'zj') as 'zj' | 'lc').softBackground}, rgba(255,255,255,0.94))`,
                  }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: coachTheme((profileViewer.coachId || 'zj') as 'zj' | 'lc').ink }}>
                    AI Coach
                  </p>
                  <div className="mt-4 flex items-center gap-4">
                    <CoachAvatar coach={(profileViewer.coachId || 'zj') as CoachId} state="selected" size={76} />
                    <h3 className="text-[2rem] font-semibold tracking-tight text-slate-900">
                      {coachDisplayName(profileViewer.coachId || 'zj')}
                    </h3>
                  </div>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                    {coachTheme((profileViewer.coachId || 'zj') as 'zj' | 'lc').description}
                  </p>
                  <p className="mt-5 text-sm text-slate-500">
                    Supports photo analysis, training feedback, profile planning, and progress guidance in the same conversation flow.
                  </p>
                </div>
              </section>
            ) : null}

            {!profileViewer.loading && profileViewer.type === 'user' && viewerProfile ? (
              <>
                <section className="overflow-hidden rounded-[32px] bg-white/72 shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
                  <div className="relative">
                    {viewerProfile.background_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={resolveApiAssetUrl(viewerProfile.background_url)}
                        alt={`${viewerProfileName} background`}
                        className="h-[190px] w-full object-cover sm:h-[240px]"
                      />
                    ) : (
                      <div className="h-[190px] w-full bg-[linear-gradient(135deg,rgba(241,245,249,0.92),rgba(226,232,240,0.66))] sm:h-[240px]" />
                    )}

                    <div className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,0.9))]" />
                  </div>

                  <div className="relative px-5 pb-5 sm:px-8 sm:pb-7">
                    <div className="-mt-10 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
                      <div className="flex min-w-0 items-end gap-4">
                        {viewerProfile.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolveApiAssetUrl(viewerProfile.avatar_url)}
                            alt={viewerProfileName}
                            className="size-20 rounded-[26px] object-cover shadow-[0_16px_36px_rgba(15,23,42,0.12)] sm:size-24 sm:rounded-[30px]"
                          />
                        ) : (
                          <div
                            className="grid size-20 place-items-center rounded-[26px] text-xl font-semibold text-white shadow-[0_16px_36px_rgba(15,23,42,0.12)] sm:size-24 sm:rounded-[30px] sm:text-2xl"
                            style={{ background: neutralTheme.gradient }}
                          >
                            {avatarInitial(viewerProfileName)}
                          </div>
                        )}

                        <div className="min-w-0 pb-1">
                          <h3 className="truncate text-[1.7rem] font-semibold tracking-tight text-slate-900 sm:text-[2.1rem]">
                            {viewerProfileName}
                          </h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {viewerProfile.fitness_goal || viewerProfile.bio || 'No intro yet.'}
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            <span>User ID {viewerProfile.id}</span>
                            <span>•</span>
                            <span>{profileViewer.data?.friendship_status === 'accepted' ? 'Friend' : 'Community member'}</span>
                            {viewerProfile.enabled_coaches?.length ? (
                              <>
                                <span>•</span>
                                <span>{viewerProfile.enabled_coaches.length} coach chat{viewerProfile.enabled_coaches.length > 1 ? 's' : ''}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {viewerProfile.id !== authUserId ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {primaryActionLabel ? (
                            <button
                              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                                primaryActionEnabled
                                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                                  : 'bg-slate-200 text-slate-500'
                              }`}
                              type="button"
                              disabled={!primaryActionEnabled}
                              onClick={() => void handleProfileViewerPrimaryAction()}
                            >
                              {profileViewerActionPending ? 'Working...' : primaryActionLabel}
                            </button>
                          ) : null}
                          <button
                            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                            type="button"
                            onClick={() => {
                              openAbuseReportDialog(
                                'user',
                                viewerProfile.id,
                                'inappropriate_behavior',
                                `Reported user ${viewerProfileName} from profile viewer`,
                              );
                            }}
                          >
                            Report
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(240px,0.7fr)] sm:gap-4">
                  <div className="rounded-[28px] bg-white/66 px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)] sm:px-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">About</p>
                    <div className="mt-4 grid gap-4 text-sm leading-7 text-slate-600">
                      <div>
                        <p className="font-semibold text-slate-900">Bio</p>
                        <p className="mt-1">{viewerProfile.bio || 'No bio yet.'}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Fitness goal</p>
                        <p className="mt-1">{viewerProfile.fitness_goal || 'Not set.'}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">Hobbies</p>
                        <p className="mt-1">{viewerProfile.hobbies || 'Not set.'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] bg-white/66 px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)] sm:px-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Today</p>
                    <div className="mt-4 text-sm leading-7 text-slate-600">
                      {viewerHealth ? (
                        <>
                          <p><span className="font-semibold text-slate-900">{viewerHealth.steps}</span> steps</p>
                          <p><span className="font-semibold text-slate-900">{viewerHealth.calories_burned}</span> cal burned</p>
                          <p><span className="font-semibold text-slate-900">{viewerHealth.active_minutes}</span> active minutes</p>
                        </>
                      ) : (
                        <p>No synced health data today.</p>
                      )}
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] bg-white/66 px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.05)] sm:px-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Posts</p>
                      <h4 className="mt-1 text-lg font-semibold text-slate-900">Recent public posts</h4>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{viewerPosts.length}</span>
                  </div>

                  {viewerPosts.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No public posts yet.</p>
                  ) : (
                    <div className="mt-4 grid gap-4">
                      {viewerPosts.map((post) => (
                        <article key={post.id} className="rounded-[24px] bg-white/82 px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                          {post.content ? (
                            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{post.content}</p>
                          ) : null}
                          {post.media_urls.length > 0 ? (
                            <div className="post-media-grid mt-3">
                              {post.media_urls.map((url) => {
                                const mediaUrl = resolveApiAssetUrl(url);
                                if (!mediaUrl) return null;
                                return (
                                  <button
                                    key={mediaUrl}
                                    type="button"
                                    className="post-media-item"
                                    onClick={() => openMediaLightbox(mediaUrl, `${viewerProfileName}'s post media`)}
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
                          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                            {formatTime(post.created_at)} · {post.reaction_count} like{post.reaction_count === 1 ? '' : 's'}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : null}

            {!profileViewer.loading && profileViewer.type === 'user' && !viewerProfile ? (
              <div className="rounded-[28px] bg-white/66 px-5 py-8 text-sm text-slate-500 shadow-[0_20px_48px_rgba(15,23,42,0.05)]">
                Profile unavailable.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  const renderCommunityPage = () => {
    const hasPostDraft = postText.trim().length > 0 || postFiles.length > 0 || Boolean(postLocation);

    return (
      <div className="flex h-full flex-col">
        {renderAppHeader(
          'Community',
          '',
          communityQuery,
          setCommunityQuery,
          'Search community posts...',
          undefined,
          communityQuery.trim() ? communitySearchSuggestions : undefined,
          setCommunityQuery,
          <div className="flex items-center gap-2">
            <div ref={communityNotificationsRef} className="relative">
              <button
                type="button"
                className="relative flex size-8 items-center justify-center rounded-full bg-white/70 text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:bg-white sm:size-9"
                onClick={() => setCommunityNotificationsOpen((prev) => !prev)}
                title={communityNotificationsOpen ? 'Close notifications' : 'Open notifications'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>notifications</span>
                {unreadCommunityNotificationCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
                    {Math.min(unreadCommunityNotificationCount, 9)}
                  </span>
                ) : null}
              </button>
              {communityNotificationsOpen ? (
                <div className="absolute right-0 top-[calc(100%+10px)] z-30 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-[22px] bg-white/96 p-3 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Unread</p>
                      <h3 className="text-sm font-semibold text-slate-900">Latest notifications</h3>
                    </div>
                    {unreadCommunityNotificationCount > 0 ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-slate-500 transition hover:text-slate-900"
                        onClick={() => void handleMarkAllCommunityNotificationsRead()}
                      >
                        Mark all read
                      </button>
                    ) : null}
                  </div>

                  <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
                    {activityNotificationsLoading || mentionsLoading ? (
                      <p className="text-sm text-slate-500">Loading notifications...</p>
                    ) : null}
                    {!activityNotificationsLoading && !mentionsLoading && prioritizedCommunityNotifications.length === 0 ? (
                      <p className="text-sm leading-6 text-slate-500">No notifications yet. Mentions, messages, likes, and comments will land here.</p>
                    ) : null}
                    {prioritizedCommunityNotifications.slice(0, 10).map((notification) => (
                      <button
                        key={notification.key}
                        type="button"
                        className={`rounded-[18px] px-3 py-3 text-left transition ${
                          notification.is_read ? 'bg-slate-50/70' : 'bg-slate-100'
                        } hover:bg-slate-100`}
                        onClick={() => void handleOpenCommunityNotification(notification)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-2.5">
                            <span className="material-symbols-outlined mt-0.5 text-slate-400" style={{ fontSize: 18 }}>
                              {notification.icon}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-slate-900 sm:text-sm">{notification.title}</p>
                              <p className="mt-1 text-[12px] leading-5 text-slate-500">{notification.snippet}</p>
                            </div>
                          </div>
                          {!notification.is_read ? (
                            <span className="mt-1 inline-flex size-2.5 shrink-0 rounded-full bg-[#ef4444]" />
                          ) : null}
                        </div>
                        <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-slate-400">{formatTime(notification.created_at)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-full bg-white/70 text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition hover:bg-white sm:size-9"
                onClick={() => setCommunityActionsOpen((prev) => !prev)}
                title={communityActionsOpen ? 'Close actions' : 'Open actions'}
              >
                <span
                  className="material-symbols-outlined transition"
                  style={{
                    fontSize: 18,
                    transform: communityActionsOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                  }}
                >
                  add
                </span>
              </button>
              {communityActionsOpen ? (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 flex min-w-[180px] flex-col gap-1.5 rounded-[18px] bg-[rgba(17,24,39,0.92)] p-2.5 text-white shadow-xl backdrop-blur-xl">
                  <button
                    type="button"
                    className="rounded-[14px] px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-white/10"
                    onClick={() => {
                      setCommunityActionsOpen(false);
                      router.push('/friends');
                    }}
                  >
                    Add Friends
                  </button>
                  <button
                    type="button"
                    className="rounded-[14px] px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-white/10"
                    onClick={() => {
                      setCommunityActionsOpen(false);
                      setCoachPickerOpen(true);
                    }}
                  >
                    Add Coaches
                  </button>
                </div>
              ) : null}
            </div>
          </div>,
        )}

        <div className="grid min-h-0 flex-1 gap-3 p-3 sm:gap-6 sm:p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-h-0 overflow-y-auto pr-1">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-6">
              <section className="rounded-[24px] bg-white/62 p-4 shadow-[0_22px_54px_rgba(15,23,42,0.06)] backdrop-blur-2xl sm:rounded-[30px] sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <div
                      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-base font-semibold sm:size-12 sm:text-lg"
                      style={{
                        background: neutralTheme.accentBackground,
                        color: neutralTheme.ink,
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
                          alt={displayUserName(profile, authUsername || 'Your avatar')}
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        avatarInitial(displayUserName(profile, authUsername || 'U'))
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{hasPostDraft ? 'Continue your draft' : 'Create something small'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {hasPostDraft
                          ? `${postText.trim() ? `${postText.trim().length} characters` : 'Draft ready'}${postFiles.length > 0 ? ` · ${postFiles.length} file(s)` : ''}`
                          : 'Keep the feed open until you actually want to post.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white shadow-[0_14px_30px_rgba(15,23,42,0.14)] transition hover:scale-[1.02]"
                    onClick={() => setCommunityComposerOpen((prev) => !prev)}
                    aria-label={communityComposerOpen ? 'Collapse composer' : 'Open composer'}
                  >
                    <span
                      className="material-symbols-outlined transition"
                      style={{ fontSize: 22, transform: communityComposerOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}
                    >
                      add
                    </span>
                  </button>
                </div>

                {communityComposerOpen ? (
                  <div className="mt-4 border-t border-slate-200/55 pt-4">
                    <textarea
                      className="min-h-[88px] w-full resize-none rounded-[20px] bg-slate-50/80 px-4 py-3 text-[14px] leading-6 text-slate-800 outline-none placeholder:text-slate-400 sm:text-base"
                      value={postText}
                      placeholder="What's on your mind?"
                      onChange={(event) => setPostText(event.target.value)}
                    />

                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      <label
                        className="flex cursor-pointer items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200 sm:px-4 sm:py-2 sm:text-sm"
                      >
                        <span className="material-symbols-outlined text-base sm:text-lg">image</span>
                        Add media
                        <input hidden type="file" multiple accept="image/*,video/*" onChange={onFileSelect(postFiles, setPostFiles)} />
                      </label>
                      {postVisibility === 'public' ? (
                        <button
                          type="button"
                          className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200 sm:px-4 sm:py-2 sm:text-sm"
                          onClick={() => {
                            const nextTag = composerHashtagSuggestions[0];
                            if (nextTag) {
                              setPostText((prev) => appendHashtagToDraft(prev, nextTag));
                            }
                          }}
                        >
                          <span className="text-sm font-bold">#</span>
                          Suggest hashtag
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-200 sm:px-4 sm:py-2 sm:text-sm"
                        onClick={() => openLocationPicker()}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>near_me</span>
                        {postLocation ? 'Edit location' : 'Add location'}
                      </button>
                      <span className="text-xs text-slate-500">{postFiles.length > 0 ? `${postFiles.length} file(s) selected` : 'No files selected'}</span>
                      {postFiles.length > 0 ? (
                        <button className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} type="button" onClick={() => setPostFiles([])}>
                          Clear
                        </button>
                      ) : null}
                    </div>

                    {postVisibility === 'public' && composerHashtagSuggestions.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {composerHashtagSuggestions.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition hover:bg-slate-50 sm:text-[13px]"
                            onClick={() => setPostText((prev) => appendHashtagToDraft(prev, tag))}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {postLocation ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>place</span>
                          {postLocation.label}
                        </span>
                        <button
                          type="button"
                          className="text-[12px] font-semibold text-slate-400 transition hover:text-slate-700"
                          onClick={() => setPostLocation(null)}
                        >
                          Clear location
                        </button>
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <label className="relative flex w-full min-w-0 items-center sm:min-w-[170px] sm:w-auto">
                        <select
                          className="w-full appearance-none rounded-full border border-transparent bg-slate-100/90 px-4 py-2 pr-10 text-[13px] font-medium text-slate-700 outline-none transition sm:py-2.5 sm:text-sm"
                          value={postVisibility}
                          onChange={(event) => {
                            const nextVisibility = event.target.value as 'public' | 'friends';
                            setPostVisibility(nextVisibility);
                            if (nextVisibility !== 'public') {
                              setPostText((prev) => stripHashtagsFromDraft(prev));
                            }
                          }}
                          aria-label="Post visibility"
                        >
                          <option value="public">Public</option>
                          <option value="friends">Friends only</option>
                        </select>
                        <span
                          className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                          style={{ fontSize: 16 }}
                        >
                          expand_more
                        </span>
                      </label>
                      <div className="flex items-center gap-2">
                        {postVisibility !== 'public' ? (
                          <span className="text-xs text-slate-400">Hashtags stay on public posts.</span>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setCommunityComposerOpen(false)}
                        >
                          Collapse
                        </button>
                        <button className={`${selectedCoachButtonClass} self-start sm:self-auto`} disabled={postPending || !isOnline} onClick={() => void handleCreatePost()}>
                          {postPending ? 'Posting...' : 'Post'}
                        </button>
                      </div>
                    </div>

                    <MediaPreviewGrid
                      items={postFilePreviews}
                      onRemove={(index) => removeAttachmentAt(index, setPostFiles)}
                      wrapperClassName="media-grid-preview"
                      itemClassName="media-thumb"
                    />
                  </div>
                ) : null}
              </section>

              {feedLoading ? (
                <section className="rounded-[22px] bg-white/45 p-4 backdrop-blur-xl sm:rounded-[30px] sm:p-5">
                  <div className="feed-skeleton" />
                  <div className="feed-skeleton" />
                </section>
              ) : null}

              {filteredFeed.map((post) => {
                const postHashtags = extractHashtagsFromText(post.content);
                const postLocationLabel = feedLocationLabel(post);
                const postName = displayUserName(post, post.username);
                return (
                  <article key={post.id} className="rounded-[24px] bg-white/42 p-4 backdrop-blur-xl transition hover:bg-white/56 sm:rounded-[30px] sm:p-5">
                    <header className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-3 text-left transition hover:opacity-90"
                        onClick={() => void openPublicProfile(post.user_id)}
                        aria-label={`Open ${postName} profile`}
                      >
                        <div
                          className="flex size-10 items-center justify-center overflow-hidden rounded-full text-sm font-semibold sm:size-11"
                          style={{
                            background: neutralTheme.accentBackground,
                            color: neutralTheme.ink,
                          }}
                        >
                          {post.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveApiAssetUrl(post.avatar_url)}
                              alt={postName}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            avatarInitial(postName)
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="truncate text-[13px] text-slate-900 sm:text-sm">{postName}</strong>
                            <span className="text-xs text-slate-400">{formatTime(post.created_at)}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] sm:text-xs sm:tracking-[0.18em]" style={{ color: selectedCoachTheme.ink }}>{post.type}</p>
                            {postLocationLabel ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>place</span>
                                {postLocationLabel}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
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
                          <div className="absolute right-0 top-[calc(100%+10px)] z-20 min-w-[220px] rounded-[22px] bg-white/95 p-2 shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
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
                        <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-slate-700 sm:mt-4 sm:text-sm sm:leading-7">
                          {expandedPostIds.includes(post.id) || post.content.length <= 180
                            ? post.content
                            : `${post.content.slice(0, 180)}...`}
                        </p>
                        {postHashtags.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {postHashtags.map((tag) => (
                              <button
                                key={`${post.id}-${tag}`}
                                type="button"
                                className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-200"
                                onClick={() => setCommunityQuery(`#${tag}`)}
                              >
                                #{tag}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {post.content.length > 180 ? (
                          <button className="mt-2 text-[13px] font-semibold sm:text-sm" style={{ color: selectedCoachTheme.ink }} onClick={() => togglePostExpanded(post.id)}>
                            {expandedPostIds.includes(post.id) ? 'Collapse' : 'Read more'}
                          </button>
                        ) : null}
                      </>
                    ) : null}

                    {post.media_urls?.length > 0 ? (
                      <div className="mt-3 grid gap-2.5 sm:mt-4 sm:gap-3 md:grid-cols-2">
                        {post.media_urls.map((url) => {
                          const mediaUrl = resolveApiAssetUrl(url);
                          if (!mediaUrl) return null;
                          return (
                            <button
                              key={mediaUrl}
                              type="button"
                              className="overflow-hidden rounded-[18px] bg-white/60 shadow-[0_14px_30px_rgba(15,23,42,0.06)] sm:rounded-[22px]"
                              onClick={() => openMediaLightbox(mediaUrl, `${postName}'s post media`)}
                            >
                              {isVideoUrl(mediaUrl) ? (
                                <video src={mediaUrl} muted playsInline preload="metadata" style={{ width: '100%', maxHeight: 220 }} />
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={mediaUrl} alt="feed media" style={{ width: '100%', maxHeight: 220, objectFit: 'cover' }} />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-4 sm:gap-3">
                      <button
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] transition sm:px-4 sm:py-2 sm:text-sm ${
                          post.viewer_has_liked
                            ? 'bg-[rgba(239,68,68,0.08)] text-[#ef4444]'
                            : 'bg-white/80 text-slate-600 hover:bg-white'
                        }`}
                        disabled={reactingPostIds.includes(post.id)}
                        onClick={() => void handleReact(post.id)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          {post.viewer_has_liked ? 'favorite' : 'favorite_border'}
                        </span>
                        {post.reaction_count || 0}
                      </button>
                      <button
                        className="rounded-full bg-white/80 px-3 py-1.5 text-[13px] text-slate-600 transition hover:bg-white sm:px-4 sm:py-2 sm:text-sm"
                        onClick={() => void togglePostComments(post.id)}
                      >
                        Comments {post.comment_count || 0}
                      </button>
                      <button
                        className="rounded-full bg-white/80 px-3 py-1.5 text-[13px] text-slate-600 transition hover:bg-white sm:px-4 sm:py-2 sm:text-sm"
                        onClick={() => togglePostExpanded(post.id)}
                      >
                        {expandedPostIds.includes(post.id) ? 'Hide detail' : 'Detail'}
                      </button>
                      <button
                        className="rounded-full bg-white/80 px-3 py-1.5 text-[13px] text-slate-600 transition hover:bg-white sm:px-4 sm:py-2 sm:text-sm"
                        onClick={() => openAbuseReportDialog('post', post.id, 'spam_or_harassment', `Reported from feed post #${post.id}`)}
                      >
                        Report
                      </button>
                    </div>

                    {expandedCommentPostIds.includes(post.id) ? (
                      <section className="mt-3 rounded-[18px] bg-white/62 p-3 sm:mt-4 sm:rounded-[22px] sm:p-4">
                        <div className="space-y-3">
                          {commentLoadingPostIds.includes(post.id) ? <p className="text-sm text-slate-500">Loading comments...</p> : null}
                          {(postCommentsById[post.id] || []).map((comment) => {
                            const commentName = displayUserName(comment, comment.username);
                            return (
                            <article key={comment.id} className="rounded-[18px] bg-white/86 px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3">
                              <div className="flex items-start gap-3">
                                <button
                                  type="button"
                                  className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-semibold transition hover:opacity-90 sm:size-9"
                                  style={{
                                    background: neutralTheme.accentBackground,
                                    color: neutralTheme.ink,
                                  }}
                                  onClick={() => void openPublicProfile(comment.user_id)}
                                  aria-label={`Open ${commentName} profile`}
                                >
                                  {comment.avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={resolveApiAssetUrl(comment.avatar_url)}
                                      alt={commentName}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  ) : (
                                    avatarInitial(commentName)
                                  )}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                                    <button
                                      type="button"
                                      className="truncate text-left text-[13px] font-semibold text-slate-700 transition hover:text-slate-900 sm:text-sm"
                                      onClick={() => void openPublicProfile(comment.user_id)}
                                    >
                                      {commentName}
                                    </button>
                                    <span>{formatTime(comment.created_at)}</span>
                                  </div>
                                  <p className="mt-1.5 text-[13px] leading-5 text-slate-600 sm:mt-2 sm:text-sm">{comment.content}</p>
                                </div>
                              </div>
                            </article>
                            );
                          })}
                          {!commentLoadingPostIds.includes(post.id) && (postCommentsById[post.id] || []).length === 0 ? (
                            <p className="text-sm text-slate-500">No comments yet. Start the conversation.</p>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-col gap-2.5 sm:mt-4 md:flex-row">
                          <input
                            className="input-shell text-[14px]"
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
                            className={`${selectedCoachButtonClass} self-start md:self-auto`}
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
                );
              })}

              {!feedLoading && filteredFeed.length === 0 ? (
                <div className="rounded-[22px] bg-slate-100/70 p-4 text-[13px] text-slate-500 sm:rounded-[28px] sm:p-5 sm:text-sm">
                  No community posts matched your search.
                </div>
              ) : null}
            </div>
          </section>

          <aside className="hidden min-h-0 flex-col gap-5 overflow-y-auto xl:flex">
            <section className="rounded-[24px] bg-white/58 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Trending</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">Public tags</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">Only hashtags from public posts show up here.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {trendingHashtags.length > 0 ? trendingHashtags.map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    className="rounded-full bg-slate-100 px-3 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-200"
                    onClick={() => setCommunityQuery(`#${item.tag}`)}
                  >
                    #{item.tag} <span className="ml-1 text-slate-400">{item.count}</span>
                  </button>
                )) : (
                  <p className="text-sm text-slate-500">No hashtags have been posted yet.</p>
                )}
              </div>
            </section>

          </aside>
        </div>

        {locationPickerOpen ? (
          <div className="fixed inset-0 z-40 flex items-end justify-center bg-[rgba(15,23,42,0.18)] p-3 backdrop-blur-[2px] sm:items-center sm:p-6">
            <div className="w-full max-w-lg rounded-[28px] bg-white/96 p-4 shadow-[0_28px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Post location
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    Attach a location
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    Pick a city, use your current location, or search for a place.
                  </p>
                </div>
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                  onClick={closeLocationPicker}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-3 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-200"
                  disabled={locationPickerPending}
                  onClick={() => void handleUseBrowserLocation('city')}
                >
                  Use current city
                </button>
                <button
                  type="button"
                  className="rounded-full bg-slate-100 px-3 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-200"
                  disabled={locationPickerPending}
                  onClick={() => void handleUseBrowserLocation('precise')}
                >
                  Use precise location
                </button>
                {sharedLocation ? (
                  <button
                    type="button"
                    className="rounded-full bg-slate-100 px-3 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-200"
                    disabled={locationPickerPending}
                    onClick={() => void applyLocationSelection(sharedLocation)}
                  >
                    Use saved: {sharedLocation.label}
                  </button>
                ) : null}
              </div>

              <label className="relative mt-4 block">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" style={{ fontSize: 16 }}>search</span>
                <input
                  className="w-full rounded-full bg-slate-100/90 py-2.5 pl-9 pr-4 text-sm text-slate-700 outline-none transition focus:bg-white"
                  value={locationSearchQuery}
                  onChange={(event) => setLocationSearchQuery(event.target.value)}
                  placeholder="Search city, neighborhood, or gym area"
                />
              </label>

              <div className="mt-4 flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
                {locationSearchLoading ? <p className="text-sm text-slate-500">Searching locations...</p> : null}
                {!locationSearchLoading && locationSearchQuery.trim().length >= 2 && locationSearchResults.length === 0 ? (
                  <p className="text-sm text-slate-500">No matching locations yet. Try a broader city name.</p>
                ) : null}
                {!locationSearchLoading && locationSearchQuery.trim().length < 2 && sharedLocation ? (
                  <p className="text-sm text-slate-500">Your saved location is ready if you want to reuse it.</p>
                ) : null}
                {locationSearchResults.map((result) => (
                  <button
                    key={`${result.label}-${result.latitude}-${result.longitude}`}
                    type="button"
                    className="rounded-[18px] bg-slate-50/90 px-3 py-3 text-left transition hover:bg-slate-100"
                    disabled={locationPickerPending}
                    onClick={() => void applyLocationSelection(result)}
                  >
                    <p className="text-sm font-semibold text-slate-900">{result.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{result.city} · {result.precision === 'city' ? 'City-level' : 'Precise'}</p>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-400">
                  {locationPickerPending ? 'Saving location...' : 'Choose a result to continue.'}
                </span>
                {postLocation ? (
                  <button
                    type="button"
                    className="text-sm font-semibold text-slate-400 transition hover:text-slate-700"
                    onClick={() => {
                      setPostLocation(null);
                      closeLocationPicker();
                    }}
                  >
                    Remove post location
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderCalendarPage = () => (
    <div className="flex h-full flex-col">
      {renderAppHeader(
        'Calendar',
        '',
        undefined,
        undefined,
        undefined,
        undefined,
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden p-4 md:p-6">
        <section className="min-h-0 flex-1 overflow-hidden rounded-[32px] bg-white/38 backdrop-blur-xl">
          <CoachCalendarPanel
            userId={authUserId}
            active={ready && authUserId > 0}
            onNotice={showNotice}
            onError={setError}
          />
        </section>
      </div>
    </div>
  );

  const renderProfilePage = () => (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="flex items-center justify-between border-b border-slate-200/50 bg-white/20 px-4 py-2.5 backdrop-blur-sm sm:px-5 sm:py-3 md:px-8">
        <div>
          <h1 className="text-[1.3rem] font-semibold tracking-tight text-slate-900 sm:text-[1.9rem] md:text-[2.15rem]">Profile</h1>
        </div>
      </header>

      <div className="flex flex-col gap-3 p-3 sm:gap-6 sm:p-4 md:p-6">
        <section className="rounded-[24px] bg-white/42 p-4 backdrop-blur-xl sm:rounded-[32px] sm:p-5 md:p-8">
          <div className="mb-5 overflow-hidden rounded-[22px] bg-white/58 sm:mb-8 sm:rounded-[28px]">
            {profileDraft.background_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveApiAssetUrl(profileDraft.background_url)}
                alt="Profile cover"
                className="h-32 w-full object-cover sm:h-40"
              />
            ) : (
              <div className="h-32 w-full bg-[linear-gradient(135deg,rgba(71,85,105,0.16),rgba(17,24,39,0.12))] sm:h-40" />
            )}
          </div>

          <div className="flex flex-col gap-5 sm:gap-8 md:flex-row md:items-center">
            <div className="relative">
              {profileDraft.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolveApiAssetUrl(profileDraft.avatar_url)}
                  alt="Profile avatar"
                  className="size-24 rounded-full object-cover ring-4 ring-white sm:size-32"
                />
              ) : (
                <div className="flex size-24 items-center justify-center rounded-full text-3xl font-bold text-white ring-4 ring-white sm:size-32 sm:text-4xl" style={{ background: selectedCoachTheme.gradient }}>
                  {avatarInitial(displayUserName(profile, authUsername || 'User'))}
                </div>
              )}
              <span className="absolute bottom-1.5 right-1.5 size-6 rounded-full border-4 border-white bg-emerald-500 sm:bottom-2 sm:right-2 sm:size-8" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-[1.7rem] font-bold tracking-tight text-slate-900 sm:text-3xl">{displayUserName(profile, authUsername || 'User')}</h2>
                  <p className="mt-1.5 text-[13px] text-slate-500 sm:mt-2 sm:text-sm">
                    ID: {profile?.public_uuid || authUserId} • {enabledCoaches.length > 0 ? `${enabledCoaches.length} coach chat${enabledCoaches.length > 1 ? 's' : ''} enabled` : 'No coach chats enabled yet'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5 sm:gap-3">
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

              <div className="mt-4 grid gap-2.5 sm:mt-6 sm:gap-3 sm:grid-cols-3">
                <article className="rounded-[18px] bg-white/72 p-3 sm:rounded-2xl sm:p-4">
                  <label className="text-xs font-semibold text-slate-500">Bio</label>
                  <p className="mt-1.5 text-[13px] text-slate-800 sm:mt-2 sm:text-sm">{profile?.bio || 'Not set'}</p>
                </article>
                <article className="rounded-[18px] bg-white/72 p-3 sm:rounded-2xl sm:p-4">
                  <label className="text-xs font-semibold text-slate-500">Fitness Goal</label>
                  <p className="mt-1.5 text-[13px] text-slate-800 sm:mt-2 sm:text-sm">{profile?.fitness_goal || 'Not set'}</p>
                </article>
                <article className="rounded-[18px] bg-white/72 p-3 sm:rounded-2xl sm:p-4">
                  <label className="text-xs font-semibold text-slate-500">Hobbies</label>
                  <p className="mt-1.5 text-[13px] text-slate-800 sm:mt-2 sm:text-sm">{profile?.hobbies || 'Not set'}</p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-3 sm:gap-6 lg:grid-cols-2">
          <section className="rounded-[22px] bg-white/38 p-4 backdrop-blur-xl sm:rounded-[28px] sm:p-5">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Edit Profile</h2>
            <p className="mt-1 text-[13px] text-slate-500 sm:text-sm">Changes sync to iOS and web for the same account.</p>
            <div className="mt-4 grid gap-2.5 sm:mt-5 sm:gap-3">
                <input
                  className="input-shell"
                  placeholder="Display name"
                  value={profileDraft.display_name}
                  onChange={(event) => setProfileDraft((prev) => ({ ...prev, display_name: event.target.value }))}
                />
                <textarea
                  className="input-shell min-h-[96px]"
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
                <button className={`${selectedCoachButtonClass} w-full sm:w-auto`} disabled={profilePending} onClick={() => void handleSaveProfile()}>
                  {profilePending ? 'Saving...' : 'Save profile'}
                </button>
              </div>
            </section>

          <section className="rounded-[22px] bg-white/38 p-4 backdrop-blur-xl sm:rounded-[28px] sm:p-5">
            <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Coach Chats</h2>
            <p className="mt-1 text-[13px] text-slate-500 sm:text-sm">Enable or open coaches from the Community `+` menu. Each coach keeps a separate conversation history.</p>
            <div className="mt-4 flex flex-wrap gap-2.5 sm:mt-5">
              {enabledCoaches.length > 0 ? enabledCoaches.map((coach) => (
                  <span
                    key={coach}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  >
                    <CoachAvatar coach={coach} state="idle" size={24} />
                    {coachDisplayName(coach)}
                  </span>
                )) : (
                <p className="text-sm text-slate-500">No coach chats enabled yet.</p>
              )}
            </div>
          </section>
        </div>

        <section className="rounded-[22px] bg-white/52 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-xl sm:rounded-[28px] sm:p-5">
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Notification Settings</h2>
          <p className="mt-1 text-[13px] text-slate-500 sm:text-sm">Set account-wide defaults here. Chat-level mute is available from the three-dot menu inside each conversation.</p>
          <div className="mt-4 grid gap-3 sm:mt-5">
            <div className="flex items-center justify-between gap-4 rounded-[20px] bg-slate-50/85 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Messages</p>
                <p className="mt-1 text-xs text-slate-500">Notify for direct, coach, and group messages by default.</p>
              </div>
              <button
                type="button"
                className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                  notificationPreferences.messageNotificationsEnabled ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                }`}
                disabled={notificationPreferencesPending}
                onClick={() => void handleUpdateNotificationPreferences({
                  messageNotificationsEnabled: !notificationPreferences.messageNotificationsEnabled,
                })}
              >
                {notificationPreferencesPending ? 'Saving' : notificationPreferences.messageNotificationsEnabled ? 'Notify' : 'Muted'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-[20px] bg-slate-50/85 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Posts</p>
                <p className="mt-1 text-xs text-slate-500">Control likes and comments on your community posts.</p>
              </div>
              <button
                type="button"
                className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                  notificationPreferences.postNotificationsEnabled ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                }`}
                disabled={notificationPreferencesPending}
                onClick={() => void handleUpdateNotificationPreferences({
                  postNotificationsEnabled: !notificationPreferences.postNotificationsEnabled,
                })}
              >
                {notificationPreferencesPending ? 'Saving' : notificationPreferences.postNotificationsEnabled ? 'Notify' : 'Muted'}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[22px] bg-white/52 p-4 shadow-[0_18px_44px_rgba(15,23,42,0.05)] backdrop-blur-xl sm:rounded-[28px] sm:p-5">
          <h2 className="text-lg font-bold text-slate-900 sm:text-xl">Message Bubble</h2>
          <p className="mt-1 text-[13px] text-slate-500 sm:text-sm">Pick a default chat color style for this device.</p>
          <div className="mt-4 grid gap-3 sm:mt-5 sm:grid-cols-2">
            {messageBubbleThemePresets.map((preset) => {
              const selected = preset.id === selectedMessageBubbleTheme.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`rounded-[22px] px-4 py-3 text-left transition ${
                    selected ? 'bg-slate-900 text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)]' : 'bg-slate-50/90 text-slate-700 hover:bg-slate-100'
                  }`}
                  onClick={() => {
                    setMessageBubbleThemeId(preset.id);
                    showNotice('Bubble theme updated.');
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{preset.label}</p>
                      <p className={`mt-1 text-xs ${selected ? 'text-white/70' : 'text-slate-400'}`}>Chat bubbles</p>
                    </div>
                    {selected ? (
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check</span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      className="inline-flex h-8 min-w-[84px] items-center rounded-full px-3 text-xs font-semibold"
                      style={{ background: preset.incomingFill, color: preset.incomingText }}
                    >
                      Incoming
                    </span>
                    <span
                      className="inline-flex h-8 min-w-[84px] items-center rounded-full px-3 text-xs font-semibold"
                      style={{ background: preset.outgoingFill, color: preset.outgoingText }}
                    >
                      Yours
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[22px] border border-[rgba(239,68,68,0.18)] bg-white/55 p-4 backdrop-blur-xl sm:rounded-[28px] sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">Account actions</h2>
              <p className="mt-1 text-[13px] text-slate-500 sm:text-sm">
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
      {welcomeFlowOpen && authUserId > 0 ? (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-white">
          <WelcomeFlow
            userId={authUserId}
            initialCoach={authSelectedCoach}
            onComplete={handleWelcomeComplete}
          />
        </div>
      ) : null}

      <main className="relative h-dvh overflow-hidden bg-white md:h-screen">
        {!isOnline ? (
          <div className="absolute left-4 right-4 top-3 z-20 rounded-full border border-[rgba(242,138,58,0.24)] bg-white/85 px-4 py-2 text-center text-xs font-semibold text-[color:var(--coach-lc-ink)] shadow-[0_10px_20px_rgba(177,99,34,0.12)] backdrop-blur-xl">
            Offline mode: browsing is available, but sending messages and posts is temporarily disabled.
          </div>
        ) : null}

        <aside className="fixed left-0 top-0 z-30 hidden h-screen w-20 flex-col items-center border-r border-slate-200/50 bg-[rgba(255,255,255,0.52)] py-6 backdrop-blur-xl md:flex">
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
                      background: neutralTheme.accentBackgroundStrong,
                      color: neutralTheme.ink,
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
                  borderColor: neutralTheme.borderColor,
                  color: neutralTheme.ink,
                }}
                title={authUsername || 'Profile'}
              >
                {profileDraft.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveApiAssetUrl(profileDraft.avatar_url)} alt={displayUserName(profile, authUsername || 'Profile')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  avatarInitial(displayUserName(profile, authUsername || 'U'))
                )}
              </button>
            </div>
        </aside>

        <section className={`mobile-app-content relative z-10 h-dvh min-w-0 overflow-hidden md:ml-20 md:h-screen md:pb-0 ${isOnline ? '' : 'pt-12'}`}>
            {activeTab === 'messages' ? renderMessagePage() : null}
            {activeTab === 'community' ? renderCommunityPage() : null}
            {activeTab === 'calendar' ? renderCalendarPage() : null}
            {activeTab === 'profile' ? renderProfilePage() : null}
            {profileViewer.open && profileViewer.surface === 'content-page' ? renderProfileViewerPage('content-page') : null}
        </section>

        <nav className="mobile-bottom-nav md:hidden" aria-label="Primary">
          {visibleTabs.map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-label={item.label}
                className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[18px] px-1.5 py-1.5 text-[10px] font-semibold transition ${active ? '' : 'text-slate-500'}`}
                style={active ? {
                  background: neutralTheme.accentBackgroundStrong,
                  color: neutralTheme.ink,
                } : undefined}
              >
                <TabGlyph icon={item.icon} active={active} size={20} />
                <span className="truncate">{item.label}</span>
                {item.key === 'messages' && totalUnreadCount > 0 ? (
                  <span className="absolute right-2.5 top-1 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-bold text-white">
                    {Math.min(totalUnreadCount, 99)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </main>

      {coachPickerOpen ? (
        <div
          className="fixed inset-0 z-[110] bg-[rgba(15,23,42,0.26)] px-4 py-8 backdrop-blur-sm"
          onClick={() => setCoachPickerOpen(false)}
        >
          <div
            className="mx-auto flex w-full max-w-[520px] flex-col gap-4 rounded-[28px] border border-white/70 bg-white/95 p-5 shadow-[0_28px_70px_rgba(15,23,42,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Add Coach</p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Enable a coach chat</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">Each coach keeps a separate conversation history, while your shared profile and training data stay synced.</p>
              </div>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setCoachPickerOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="grid gap-3">
              {coachCatalog.map((coach) => {
                const enabled = enabledCoaches.includes(coach.id);
                return (
                  <article key={coach.id} className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-4">
                    <div className="flex items-start gap-3">
                      <CoachAvatar coach={coach.id} state={enabled ? 'selected' : 'idle'} size={52} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-base text-slate-900">{coach.label}</strong>
                          <span className="rounded-full bg-[rgba(71,85,105,0.12)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                            {coach.badge}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{coach.description}</p>
                      </div>
                      <button
                        className={enabled ? 'btn btn-ghost' : 'btn btn-zj'}
                        type="button"
                        onClick={() => void handleEnableCoach(coach.id)}
                      >
                        {enabled ? 'Open Chat' : 'Interact'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
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
                      <p className="text-sm font-semibold text-slate-800">{displayUserName(member, member.username)}</p>
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
                          <p className="text-sm font-semibold text-slate-800">{displayUserName(user, user.username)}</p>
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
                        <span>{displayUserName(member, member.username)}</span>
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
                          <p className="text-sm font-semibold text-slate-800">{displayUserName(user, user.username)}</p>
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
                : 'Friends only means only accepted friends can see it. Public means everyone in community can see it.'}
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

'use client';

import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import {
  acceptFriend,
  addFriend,
  addGroupMember,
  createGroup,
  createPostComment,
  createPost,
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
  updateProfile,
  uploadFile,
} from '@/lib/api';
import { resolveApiAssetUrl } from '@/lib/config';
import { clearAuth, getAuth, setCoach } from '@/lib/auth-storage';
import { RealtimeClient } from '@/lib/realtime';
import { ConversationTile } from '@/components/chat/ConversationTile';
import { MediaPreviewGrid } from '@/components/media/MediaPreviewGrid';
import { CoachRecordsPanel } from '@/components/profile/CoachRecordsPanel';
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

const tabs = [
  { key: 'messages', label: 'Chats', icon: 'messages' },
  { key: 'feed', label: 'Feed', icon: 'feed' },
  { key: 'friends', label: 'Friends', icon: 'friends' },
  { key: 'leaderboard', label: 'Rank', icon: 'leaderboard' },
  { key: 'profile', label: 'Profile', icon: 'profile' },
] as const;

type TabKey = (typeof tabs)[number]['key'];
type TabIcon = (typeof tabs)[number]['icon'];

type ConversationType = 'coach' | 'dm' | 'group';
type ConversationFilter = 'all' | ConversationType;

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

const MAX_MEDIA_ATTACHMENTS = 6;
const MAX_MEDIA_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const mediaFallbackExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.mp4', '.mov', '.webm', '.m4v'];
const MESSAGE_DRAFTS_STORAGE_KEY = 'zym.web.messageDrafts.v1';
const POST_DRAFT_STORAGE_KEY = 'zym.web.postDraft.v1';

function isSupportedMediaFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/')) {
    return true;
  }
  const lowerName = file.name.toLowerCase();
  return mediaFallbackExtensions.some((ext) => lowerName.endsWith(ext));
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
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatSessionDate(iso?: string | null): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
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
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

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

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.webm') || lower.includes('.m4v');
}

function loadMessageDrafts(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MESSAGE_DRAFTS_STORAGE_KEY);
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

function persistMessageDrafts(drafts: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    const compact = Object.entries(drafts).reduce<Record<string, string>>((acc, [topic, value]) => {
      const normalized = String(value || '').slice(0, 2000);
      if (normalized.trim()) {
        acc[topic] = normalized;
      }
      return acc;
    }, {});
    localStorage.setItem(MESSAGE_DRAFTS_STORAGE_KEY, JSON.stringify(compact));
  } catch {
    // Ignore storage failures in private mode.
  }
}

function loadPostDraft(): string {
  if (typeof window === 'undefined') return '';
  try {
    return String(localStorage.getItem(POST_DRAFT_STORAGE_KEY) || '').slice(0, 6000);
  } catch {
    return '';
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

  if (/^\d{6}$/.test(value)) return true;
  if (/connectId\s*[:=]\s*\d{6}/i.test(value)) return true;
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

function avatarInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'Z';
  return trimmed.charAt(0).toUpperCase();
}

function TabGlyph({ icon, active }: { icon: TabIcon; active: boolean }) {
  const color = active ? '#ffffff' : 'currentColor';
  const common = {
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  if (icon === 'messages') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M20 11.5c0 4.2-3.7 7.5-8.3 7.5H8l-4 3v-5C2.8 15.8 2 13.8 2 11.5 2 7.3 5.7 4 10.3 4h1.4C16.3 4 20 7.3 20 11.5z" />
        <path {...common} d="M8.5 11.5h6" />
        <path {...common} d="M8.5 8.5h4.5" />
      </svg>
    );
  }

  if (icon === 'feed') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M4 18h16" />
        <path {...common} d="M6.5 14.5 10 10l3 2.5 4.5-5" />
        <circle cx="6.5" cy="14.5" r="1.2" fill={color} />
        <circle cx="10" cy="10" r="1.2" fill={color} />
        <circle cx="13" cy="12.5" r="1.2" fill={color} />
        <circle cx="17.5" cy="7.5" r="1.2" fill={color} />
      </svg>
    );
  }

  if (icon === 'friends') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle {...common} cx="8" cy="9" r="3" />
        <circle {...common} cx="16.5" cy="10" r="2.5" />
        <path {...common} d="M3.5 18c.8-2.7 2.8-4 5.9-4s5.1 1.3 5.9 4" />
        <path {...common} d="M13.5 17.8c.5-1.7 1.8-2.7 3.7-2.7 1.8 0 3 .8 3.8 2.4" />
      </svg>
    );
  }

  if (icon === 'leaderboard') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path {...common} d="M6 19V9.5h4V19" />
        <path {...common} d="M14 19V5h4v14" />
        <path {...common} d="M3 19h18" />
        <path {...common} d="m14 5 2 2 2-2" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle {...common} cx="12" cy="8" r="3.5" />
      <path {...common} d="M5 20c.8-3.1 3.1-4.8 7-4.8s6.2 1.7 7 4.8" />
    </svg>
  );
}

export default function AppPage() {
  const router = useRouter();
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const activeTopicRef = useRef<string>('');
  const authUserIdRef = useRef<number>(0);
  const noticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatStreamRef = useRef<HTMLDivElement | null>(null);
  const composerMenuRef = useRef<HTMLDivElement | null>(null);
  const conversationSearchRef = useRef<HTMLInputElement | null>(null);
  const messageDraftsRef = useRef<Record<string, string>>({});
  const skipTypingPulseRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [showAppIntro, setShowAppIntro] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [authUserId, setAuthUserId] = useState<number>(0);
  const [authUsername, setAuthUsername] = useState('');
  const [selectedCoach, setSelectedCoach] = useState<'zj' | 'lc'>('zj');

  const [tab, setTab] = useState<TabKey>('messages');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationQuery, setConversationQuery] = useState('');
  const [conversationFilter, setConversationFilter] = useState<ConversationFilter>('all');
  const [activeTopic, setActiveTopic] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [composer, setComposer] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentPreviews, setAttachmentPreviews] = useState<Array<{ url: string; isVideo: boolean; name: string }>>([]);
  const [composerActionsOpen, setComposerActionsOpen] = useState(false);
  const [pendingSend, setPendingSend] = useState(false);
  const [coachReplyPending, setCoachReplyPending] = useState(false);

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
  const [groupName, setGroupName] = useState('');
  const [groupCoachEnabled, setGroupCoachEnabled] = useState<'none' | 'zj' | 'lc'>('zj');
  const [groupMembers, setGroupMembers] = useState('');
  const [activeGroupMembers, setActiveGroupMembers] = useState<GroupMember[]>([]);
  const [activeGroupInvite, setActiveGroupInvite] = useState('');
  const [activeGroupMembersPending, setActiveGroupMembersPending] = useState(false);
  const [activeGroupInvitePending, setActiveGroupInvitePending] = useState(false);
  const [activeGroupRemovePendingId, setActiveGroupRemovePendingId] = useState<number | null>(null);

  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [postText, setPostText] = useState('');
  const [postFiles, setPostFiles] = useState<File[]>([]);
  const [postFilePreviews, setPostFilePreviews] = useState<Array<{ url: string; isVideo: boolean; name: string }>>([]);
  const [postPending, setPostPending] = useState(false);
  const [expandedPostIds, setExpandedPostIds] = useState<number[]>([]);
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
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [securityEventsLoading, setSecurityEventsLoading] = useState(false);
  const [abuseReports, setAbuseReports] = useState<AbuseReport[]>([]);
  const [abuseReportsLoading, setAbuseReportsLoading] = useState(false);
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
    label: string;
  }>({
    open: false,
    url: '',
    isVideo: false,
    label: 'Media',
  });

  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const reauthTriggeredRef = useRef(false);

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
      if (conversationFilter !== 'all' && conversation.type !== conversationFilter) return false;
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
  }, [conversationFilter, conversationQuery, conversations]);

  const unreadMentionCount = useMemo(
    () => mentionNotifications.filter((item) => !item.is_read).length,
    [mentionNotifications],
  );

  const typingLabel = useMemo(() => {
    const ids = Object.entries(typingUsers)
      .filter(([, value]) => value)
      .map(([userId]) => userId)
      .filter((userId) => userId !== String(authUserId));

    if (ids.length === 0) return '';

    const names = Array.from(
      new Set(
        ids.map((userId) => {
          if (userId === 'coach' || userId === '0') return activeConversation?.name || 'Coach';
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
  }, [typingUsers, authUserId, activeConversation, activeGroupMembers, messages]);

  const connectCodeMeta = useMemo(() => {
    if (!connectExpiresAt) return 'Secure code rotates every minute.';
    return `Secure code rotates every minute · valid until ${formatTime(connectExpiresAt)}.`;
  }, [connectExpiresAt]);

  const totalUnreadCount = useMemo(
    () => conversations.reduce((sum, item) => sum + Number(item.unreadCount || 0) + Number(item.mentionCount || 0), 0),
    [conversations],
  );

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

    if (tab === 'feed') {
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
    setMediaLightbox({
      open: true,
      url: resolved,
      isVideo: isVideoUrl(resolved),
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
    clearAuth();
    realtimeRef.current?.disconnect();
    router.replace('/login');
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

      if (topic === activeTopicRef.current) {
        setMessages((prev) => {
          if (prev.some((item) => item.id === message.id)) return prev;
          return [...prev, message];
        });

        if (authUserIdRef.current > 0) {
          void markMessagesRead({
            userId: authUserIdRef.current,
            topic,
            messageId: Number(message.id),
          }).catch(() => undefined);
        }
      }

      if (topic === activeTopicRef.current && Number(message.from_user_id) === 0) {
        setCoachReplyPending(false);
      }

      loadInbox();
      void loadMentions(authUserIdRef.current);
      return;
    }

    if (event.type === 'typing') {
      const topic = String(event.topic || '');
      if (topic !== activeTopicRef.current) return;

      const userId = String(event.userId || '');
      if (userId === String(authUserIdRef.current)) return;
      const isTyping = Boolean(event.isTyping);
      setTypingUsers((prev) => ({ ...prev, [userId]: isTyping }));
      if (typingTimeoutRef.current[userId]) {
        clearTimeout(typingTimeoutRef.current[userId]);
        delete typingTimeoutRef.current[userId];
      }
      if (isTyping) {
        typingTimeoutRef.current[userId] = setTimeout(() => {
          setTypingUsers((prev) => ({ ...prev, [userId]: false }));
          delete typingTimeoutRef.current[userId];
        }, 4500);
      }
      return;
    }

    if (event.type === 'inbox_updated') {
      loadInbox();
    }
  };

  const bootstrap = async () => {
    const auth = getAuth();
    if (!auth) {
      router.replace('/login');
      return;
    }

    setAuthUserId(auth.userId);
    setAuthUsername(auth.username);
    setSelectedCoach(auth.selectedCoach);
    const bootstrapCoachName = coachDisplayName(auth.selectedCoach);
    const defaultCoachTopic = `coach_${auth.userId}`;
    messageDraftsRef.current = loadMessageDrafts();
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
    setPostText(loadPostDraft());

    const params = new URLSearchParams(window.location.search);
    const incomingTab = params.get('tab') as TabKey | null;
    if (incomingTab && tabs.some((item) => item.key === incomingTab)) {
      setTab(incomingTab);
    }

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
    const onAuthExpired = () => forceReauth('Invalid or expired token.');
    window.addEventListener('zym-auth-expired', onAuthExpired as EventListener);
    return () => window.removeEventListener('zym-auth-expired', onAuthExpired as EventListener);
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
    if (!activeTopic) return;

    void loadMessagesForTopic(activeTopic);
    setTypingUsers({});
    setComposerActionsOpen(false);
    skipTypingPulseRef.current = true;
    setComposer(messageDraftsRef.current[activeTopic] || '');
    Object.values(typingTimeoutRef.current).forEach((timer) => clearTimeout(timer));
    typingTimeoutRef.current = {};
    setCoachReplyPending(false);
    realtimeRef.current?.subscribe(activeTopic);
  }, [activeTopic]);

  useEffect(() => {
    authUserIdRef.current = authUserId;
  }, [authUserId]);

  useEffect(() => {
    if (!activeConversation || activeConversation.type !== 'group' || !activeConversation.groupId) {
      setActiveGroupMembers([]);
      setActiveGroupInvite('');
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
    if (!ready || !authUserId || tab !== 'friends') return;
    const interval = setInterval(() => {
      void loadConnectInfo(authUserId);
    }, 55_000);
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
    persistMessageDrafts(next);
  }, [composer, activeTopic]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (postText.trim()) {
        localStorage.setItem(POST_DRAFT_STORAGE_KEY, postText.slice(0, 6000));
      } else {
        localStorage.removeItem(POST_DRAFT_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures in private mode.
    }
  }, [postText]);

  useEffect(() => {
    const container = chatStreamRef.current;
    if (!container || tab !== 'messages') return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 220;
    if (isNearBottom || messages.length < 16) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, tab, activeTopic]);

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

  async function loadInbox(userId = authUserId, coachOverride?: 'zj' | 'lc', friendSource: Friend[] = friends) {
    if (!userId) return;

    try {
      const inbox = await getInbox(userId);
      const activeCoach = coachOverride || selectedCoach;
      const coachName = coachDisplayName(activeCoach);

      const dmTopics = new Set(inbox.dms.map((item) => item.topic));
      const friendPlaceholders: Conversation[] = friendSource
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
          subtitle: `Group · ${item.coach_enabled === 'none' ? 'No AI' : 'Coach enabled'}`,
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
      setMessages(rows);
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

    try {
      setPendingSend(true);
      const uploadedMedia = attachments.length > 0 ? await Promise.all(attachments.map((file) => uploadFile(file))) : [];
      const uploadedUrls = uploadedMedia.map((item) => item.url);
      const uploadedMediaIds = uploadedMedia
        .map((item) => item.mediaId)
        .filter((item): item is string => Boolean(item));
      const text = composer.trim();
      const hasCoachMention = activeConversation?.type === 'group' && /(^|\s)@coach\b/i.test(text);

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
      };
      setMessages((prev) => [...prev, optimistic]);

      await sendMessage({
        fromUserId: authUserId,
        topic: activeTopic,
        content: text,
        mediaUrls: uploadedUrls,
        mediaIds: uploadedMediaIds,
      });

      if (hasCoachMention) {
        setCoachReplyPending(true);
      }

      showNotice('Message sent.');
      await loadMessagesForTopic(activeTopic);
      await loadInbox();
    } catch (err: any) {
      setMessages((prev) => prev.filter((item) => item.id !== optimisticId));
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

  async function handleCreateGroup(event: FormEvent) {
    event.preventDefault();
    if (!groupName.trim()) return;

    try {
      const groupId = await createGroup({
        ownerId: authUserId,
        name: groupName.trim(),
        coachEnabled: groupCoachEnabled,
      });

      const memberNames = groupMembers
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

      for (const name of memberNames) {
        await addGroupMember({ groupId, username: name });
      }

      setGroupName('');
      setGroupMembers('');
      setGroupCoachEnabled('zj');
      showNotice('Group created.');
      await loadInbox();
    } catch (err: any) {
      setError(err.message || 'Failed to create group.');
    }
  }

  async function handleInviteToActiveGroup() {
    if (!activeConversation?.groupId) return;
    const username = activeGroupInvite.trim();
    if (!username) return;

    try {
      setActiveGroupInvitePending(true);
      await addGroupMember({ groupId: activeConversation.groupId, username });
      setActiveGroupInvite('');
      showNotice(`Invited ${username}.`);
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
      const uploadedMedia = postFiles.length > 0 ? await Promise.all(postFiles.map((file) => uploadFile(file))) : [];
      const mediaUrls = uploadedMedia.map((item) => item.url);
      await createPost({
        userId: authUserId,
        type: mediaUrls.length > 0 ? 'media' : 'text',
        content: postText.trim(),
        mediaUrls,
      });

      setPostText('');
      setPostFiles([]);
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
        setTab('feed');
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
        background_url: profileDraft.background_url,
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
    try {
      if (kind === 'avatar') setProfileAvatarUploading(true);
      if (kind === 'background') setProfileBackgroundUploading(true);
      const uploaded = await uploadFile(file);
      if (!uploaded.url) {
        throw new Error('Upload did not return a file URL.');
      }

      if (kind === 'avatar') {
        setProfileDraft((prev) => ({ ...prev, avatar_url: uploaded.url }));
        showNotice('Avatar uploaded. Save profile to apply.');
      } else {
        setProfileDraft((prev) => ({ ...prev, background_url: uploaded.url }));
        showNotice('Cover uploaded. Save profile to apply.');
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

  async function submitAbuseReport(
    targetType: 'user' | 'post' | 'message' | 'group',
    targetId: number,
    defaultReason: string,
    details = '',
  ) {
    const reasonInput = window.prompt('Reason for report', defaultReason);
    if (reasonInput === null) return;
    const normalized = reasonInput.trim();
    const reason = (normalized || defaultReason).slice(0, 80);
    if (!reason) return;

    try {
      await createAbuseReport({
        userId: authUserId,
        targetType,
        targetId,
        reason,
        details: details.slice(0, 1200),
      });
      showNotice('Report submitted. Thank you for helping keep the community safe.');
      await loadAbuseReports();
    } catch (err: any) {
      setError(err.message || 'Failed to submit report.');
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
    <main className={`app-shell app-shell-refined ${isOnline ? '' : 'app-shell-offline'}`}>
      {!isOnline ? (
        <div className="offline-banner">
          Offline mode: browsing is available, but sending messages/posts is temporarily disabled.
        </div>
      ) : null}

      <aside className="surface-card app-rail zym-enter zym-delay-1">
        <div className="rail-brand zym-pulse-soft">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="ZYM logo" width={28} height={28} />
          <span>ZYM</span>
        </div>

        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`rail-nav-btn ${tab === item.key ? 'active' : ''}`}
          >
            <span className="rail-nav-icon">
              <TabGlyph icon={item.icon} active={tab === item.key} />
            </span>
            <span className="rail-nav-label">{item.label}</span>
            {item.key === 'messages' && unreadMentionCount > 0 ? (
              <span className="rail-nav-badge">{Math.min(unreadMentionCount, 99)}</span>
            ) : null}
          </button>
        ))}
      </aside>

      <section className="surface-card app-panel app-panel-list zym-enter zym-delay-2">
        <header className="panel-header">
          <h2 style={{ fontSize: 24 }}>{tab === 'messages' ? 'Conversations' : tabs.find((item) => item.key === tab)?.label}</h2>
          <p style={{ marginTop: 4, color: 'var(--ink-500)', fontSize: 13 }}>
            {tab === 'messages'
              ? `Coach: ${selectedCoach.toUpperCase()} · ${filteredConversations.length}/${conversations.length} chats`
              : 'Build your lifestyle with AI + community'}
          </p>
          {tab === 'messages' ? (
            <div className="conversation-tools">
              <input
                ref={conversationSearchRef}
                className="input-shell conversation-search"
                value={conversationQuery}
                onChange={(event) => setConversationQuery(event.target.value)}
                placeholder="Search chats, people, or groups..."
                aria-label="Search conversations"
              />
              <div className="conversation-filter-row">
                {([
                  { key: 'all', label: 'All', count: conversations.length },
                  { key: 'coach', label: 'Coach', count: conversationCounts.coach },
                  { key: 'dm', label: 'DM', count: conversationCounts.dm },
                  { key: 'group', label: 'Group', count: conversationCounts.group },
                ] as const).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`conversation-filter-pill ${conversationFilter === item.key ? 'active' : ''}`}
                    onClick={() => setConversationFilter(item.key)}
                    aria-pressed={conversationFilter === item.key}
                  >
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </header>

        <section className={`panel-momentum panel-momentum-${tab}`}>
          <div className="panel-momentum-copy">
            <span className="panel-momentum-kicker">{panelMomentum.kicker}</span>
            <h3>{panelMomentum.title}</h3>
            <p>{panelMomentum.subtitle}</p>
          </div>
          <div className="panel-momentum-stats">
            {panelMomentum.stats.map((item) => (
              <article key={item.label} className="panel-momentum-stat">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </section>

        {tab === 'messages' ? (
          <div className="conversation-stack-wrap">
            <section className="mention-panel">
              <div className="mention-panel-head">
                <h3 style={{ fontSize: 14 }}>Mentions</h3>
                {unreadMentionCount > 0 ? (
                  <button className="btn btn-ghost" style={{ padding: '5px 9px' }} type="button" onClick={() => void handleMarkAllMentionsRead()}>
                    Mark all read
                  </button>
                ) : null}
              </div>
              {mentionsLoading ? (
                <p className="entity-sub">Loading mentions...</p>
              ) : null}
              {!mentionsLoading && mentionNotifications.length === 0 ? (
                <p className="entity-sub">No mentions yet.</p>
              ) : null}
              {!mentionsLoading ? (
                <div className="mention-list">
                  {mentionNotifications.slice(0, 4).map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      className={`mention-item ${notification.is_read ? '' : 'unread'}`}
                      onClick={() => void handleOpenMention(notification)}
                    >
                      <div className="mention-item-head">
                        <strong>{notification.actor_username || 'Someone'}</strong>
                        <span>{formatTime(notification.created_at)}</span>
                      </div>
                      <p>{notification.snippet || 'Mentioned you'}</p>
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <div className="conversation-overview-strip">
              <div className="conversation-overview-item">
                <span>Coach</span>
                <strong>{conversationCounts.coach}</strong>
              </div>
              <div className="conversation-overview-item">
                <span>DM</span>
                <strong>{conversationCounts.dm}</strong>
              </div>
              <div className="conversation-overview-item">
                <span>Groups</span>
                <strong>{conversationCounts.group}</strong>
              </div>
              <div className="conversation-overview-item">
                <span>Mentions</span>
                <strong>{unreadMentionCount}</strong>
              </div>
            </div>

            <div className="conversation-stack">
              {filteredConversations.length === 0 ? (
                <div className="conversation-empty">
                  <strong>No conversations found</strong>
                  <p>Try another keyword or switch filter.</p>
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
          </div>
        ) : null}

        {tab === 'friends' ? (
          <div className="tab-content tab-content-friends zym-fade">
            <section className="flow-card flow-card-highlight">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 20 }}>Connect friends</h3>
                <p>Your connect ID: <strong>{connectId || '------'}</strong></p>
                <p>{connectCodeMeta}</p>
              </div>

              <div className="split-input-row" style={{ marginTop: 12 }}>
                <input
                  className="input-shell"
                  value={friendIdInput}
                  onChange={(event) => setFriendIdInput(event.target.value)}
                  placeholder="Enter user ID, 6-digit connect ID, or paste connect code"
                />
                <button className="btn btn-primary" type="button" onClick={() => void handleAddById()} disabled={friendByIdPending}>
                  {friendByIdPending ? 'Adding...' : 'Add'}
                </button>
              </div>

              {friendByIdError ? <p className="flow-error">{friendByIdError}</p> : null}
              {friendByIdPreview ? (
                <div className="entity-row" style={{ marginTop: 10 }}>
                  <div className="entity-main">
                    <strong>{friendByIdPreview.username}</strong>
                    <span className="entity-sub">ID: {friendByIdPreview.id} · {friendByIdPreview.friendship_status}</span>
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={() => setFriendIdInput(String(friendByIdPreview.id))}>
                    Use
                  </button>
                </div>
              ) : null}

              <div className="connect-layout" style={{ marginTop: 12 }}>
                {connectQrDataUrl ? (
                  <button
                    type="button"
                    className="qr-image-button"
                    onClick={() => openMediaLightbox(connectQrDataUrl, 'Connect QR')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="qr-image"
                      src={connectQrDataUrl}
                      alt="Your connect QR code"
                    />
                  </button>
                ) : (
                  <div className="qr-image qr-image-empty">QR unavailable</div>
                )}

                <div className="connect-actions">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      if (!connectCode) return;
                      void navigator.clipboard.writeText(connectCode);
                      showNotice('Connect code copied.');
                    }}
                  >
                    Copy connect code
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void loadConnectInfo()}
                  >
                    Refresh now
                  </button>
                  <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                    Scan QR image
                    <input hidden type="file" accept="image/*" onChange={handleScanFriendQr} />
                  </label>
                </div>
              </div>
              {connectScanError ? <span className="flow-error">{connectScanError}</span> : null}
            </section>

            <section className="flow-card">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 18 }}>Find users</h3>
                <p>Search by username and send request instantly.</p>
              </div>
              <input className="input-shell" style={{ marginTop: 10 }} value={friendQuery} onChange={(event) => setFriendQuery(event.target.value)} placeholder="Search by username" />
              <div className="entity-list" style={{ marginTop: 10 }}>
                {friendSearchResult.map((user) => (
                  <div key={user.id} className="entity-row">
                    <div className="entity-main">
                      <strong>{user.username}</strong>
                      <span className="entity-sub">ID: {user.id}</span>
                    </div>
                    <button className="btn btn-primary" onClick={() => void handleAddFriend(user)}>
                      Add
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="flow-card">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 18 }}>Pending requests</h3>
                <p>Accept to unlock DM and profile sharing.</p>
              </div>
              <div className="entity-list" style={{ marginTop: 10 }}>
                {requests.length === 0 ? <span className="entity-sub">No pending requests</span> : null}
                {requests.map((friend) => (
                  <div key={friend.id} className="entity-row">
                    <strong>{friend.username}</strong>
                    <button className="btn btn-primary" onClick={() => void handleAcceptFriend(friend.id)}>
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="flow-card">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 18 }}>Friends</h3>
                <p>Jump into direct chat or open profile.</p>
              </div>
              <div className="entity-list" style={{ marginTop: 10 }}>
                {friends.length === 0 ? <span className="entity-sub">No friends yet</span> : null}
                {friends.map((friend) => (
                  <div key={friend.id} className="entity-row">
                    <strong>{friend.username}</strong>
                    <button className="btn btn-ghost" onClick={() => void handleOpenDM(friend.id)}>
                      DM
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <form onSubmit={handleCreateGroup} className="flow-card flow-card-soft form-grid">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 18 }}>Create group</h3>
                <p>Invite members now, manage roles in group chat.</p>
              </div>
              <input className="input-shell" placeholder="Group name" value={groupName} onChange={(event) => setGroupName(event.target.value)} />
              <select className="input-shell" value={groupCoachEnabled} onChange={(event) => setGroupCoachEnabled(event.target.value as 'none' | 'zj' | 'lc')}>
                <option value="zj">Coach in group: ZJ</option>
                <option value="lc">Coach in group: LC</option>
                <option value="none">No coach in group</option>
              </select>
              <input className="input-shell" placeholder="Invite usernames (comma separated)" value={groupMembers} onChange={(event) => setGroupMembers(event.target.value)} />
              <button className="btn btn-primary" type="submit">
                Create Group
              </button>
            </form>
          </div>
        ) : null}

        {tab === 'feed' ? (
          <div className="tab-content tab-content-feed zym-fade">
            <section className="flow-card feed-composer-card">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 20 }}>Create a post</h3>
                <p>Share training, meals, recovery, and progress updates.</p>
              </div>
              <textarea
                className="input-shell feed-composer-input"
                value={postText}
                placeholder="Share your training, meals, or progress..."
                onChange={(event) => setPostText(event.target.value)}
              />

              <div className="feed-composer-toolbar">
                <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                  Add media
                  <input hidden type="file" multiple accept="image/*,video/*" onChange={onFileSelect(postFiles, setPostFiles)} />
                </label>
                <span className="entity-sub">{postFiles.length > 0 ? `${postFiles.length} file(s) selected` : 'No files selected'}</span>
                {postFiles.length > 0 ? (
                  <button className="btn btn-ghost" style={{ padding: '6px 10px' }} type="button" onClick={() => setPostFiles([])}>
                    Clear
                  </button>
                ) : null}
              </div>

              <MediaPreviewGrid
                items={postFilePreviews}
                onRemove={(index) => removeAttachmentAt(index, setPostFiles)}
                wrapperClassName="media-grid-preview"
                itemClassName="media-thumb"
              />

              <button className="btn btn-primary" style={{ marginTop: 10, width: 'fit-content' }} disabled={postPending || !isOnline} onClick={() => void handleCreatePost()}>
                {postPending ? 'Posting...' : 'Publish'}
              </button>
            </section>

            {feedLoading ? (
              <section className="flow-card">
                <div className="feed-skeleton" />
                <div className="feed-skeleton" />
              </section>
            ) : null}

            {feed.map((post) => (
              <article key={post.id} className="feed-post-card zym-enter-fast">
                <header className="feed-post-head">
                  <div>
                    <strong>{post.username}</strong>
                    <p className="entity-sub" style={{ marginTop: 2 }}>{formatTime(post.created_at)}</p>
                  </div>
                  <span className="feed-post-tag">{post.type}</span>
                </header>

                {post.content ? (
                  <>
                    <p className="feed-post-content">
                      {expandedPostIds.includes(post.id) || post.content.length <= 180
                        ? post.content
                        : `${post.content.slice(0, 180)}...`}
                    </p>
                    {post.content.length > 180 ? (
                      <button className="btn btn-ghost feed-post-link" onClick={() => togglePostExpanded(post.id)}>
                        {expandedPostIds.includes(post.id) ? 'Collapse' : 'Read more'}
                      </button>
                    ) : null}
                  </>
                ) : null}

                {post.media_urls?.length > 0 ? (
                  <div className="post-media-grid">
                    {post.media_urls.map((url) => {
                      const mediaUrl = resolveApiAssetUrl(url);
                      if (!mediaUrl) return null;
                      return (
                        <button
                          key={mediaUrl}
                          type="button"
                          className="post-media-item"
                          onClick={() => openMediaLightbox(mediaUrl, `${post.username}'s post media`)}
                        >
                          {isVideoUrl(mediaUrl) ? (
                            <video src={mediaUrl} muted playsInline preload="metadata" style={{ width: '100%', maxHeight: 180 }} />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mediaUrl} alt="feed media" style={{ width: '100%', maxHeight: 220, objectFit: 'cover' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                <div className="feed-post-actions">
                  <button className="btn btn-ghost" onClick={() => void handleReact(post.id)}>
                    Like {post.reaction_count || 0}
                  </button>
                  <button className="btn btn-ghost" onClick={() => void togglePostComments(post.id)}>
                    Comments {post.comment_count || 0}
                  </button>
                  <button className="btn btn-ghost" onClick={() => togglePostExpanded(post.id)}>
                    {expandedPostIds.includes(post.id) ? 'Hide detail' : 'Detail'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => void submitAbuseReport('post', post.id, 'spam_or_harassment', `Reported from feed post #${post.id}`)}
                  >
                    Report
                  </button>
                </div>

                {expandedCommentPostIds.includes(post.id) ? (
                  <section className="feed-comment-panel">
                    <div className="feed-comment-list">
                      {commentLoadingPostIds.includes(post.id) ? (
                        <p className="entity-sub">Loading comments...</p>
                      ) : null}
                      {(postCommentsById[post.id] || []).map((comment) => (
                        <article key={comment.id} className="feed-comment-item">
                          <div className="feed-comment-head">
                            <strong>{comment.username}</strong>
                            <span>{formatTime(comment.created_at)}</span>
                          </div>
                          <p>{comment.content}</p>
                        </article>
                      ))}
                      {!commentLoadingPostIds.includes(post.id) && (postCommentsById[post.id] || []).length === 0 ? (
                        <p className="entity-sub">No comments yet. Start the conversation.</p>
                      ) : null}
                    </div>

                    <div className="feed-comment-composer">
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
                        className="btn btn-primary"
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
          </div>
        ) : null}

        {tab === 'leaderboard' ? (
          <div className="tab-content tab-content-leaderboard zym-fade">
            <section className="flow-card flow-card-highlight form-grid">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 20 }}>Weekly leaderboard</h3>
                <p>Sync your latest steps and calories to update ranking.</p>
              </div>
              <div className="leaderboard-sync-grid">
                <input className="input-shell" value={healthSync.steps} onChange={(event) => setHealthSync((prev) => ({ ...prev, steps: event.target.value }))} placeholder="Steps" />
                <input className="input-shell" value={healthSync.calories} onChange={(event) => setHealthSync((prev) => ({ ...prev, calories: event.target.value }))} placeholder="Calories" />
              </div>
              <button className="btn btn-primary" disabled={syncPending || !isOnline} onClick={() => void handleSyncHealth()}>
                {syncPending ? 'Syncing...' : 'Sync'}
              </button>
            </section>

            <section className="flow-card">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 18 }}>Momentum (7 days)</h3>
                <p>Track consistency, trend, and best day from your recent health syncs.</p>
              </div>

              <div className="health-momentum-grid">
                <article className="health-momentum-stat">
                  <span>Current streak</span>
                  <strong>{healthMomentum?.streakDays ?? 0}d</strong>
                </article>
                <article className="health-momentum-stat">
                  <span>Active days</span>
                  <strong>{healthMomentum?.activityDays ?? 0}/7</strong>
                </article>
                <article className="health-momentum-stat">
                  <span>Avg steps</span>
                  <strong>{healthMomentum?.averages.steps ?? 0}</strong>
                </article>
                <article className="health-momentum-stat">
                  <span>Trend</span>
                  <strong>
                    {healthMomentum?.trend.direction === 'up' ? 'Up' : healthMomentum?.trend.direction === 'down' ? 'Down' : 'Flat'}
                  </strong>
                </article>
              </div>

              <div className="health-momentum-chart">
                {(() => {
                  const rows = healthMomentum?.last7Days || [];
                  const maxScore = Math.max(...rows.map((item) => item.score), 1);
                  return rows.map((day) => {
                    const ratio = Math.max(0.1, day.score / maxScore);
                    return (
                      <div key={day.date} className="health-momentum-bar-wrap">
                        <div className="health-momentum-bar-track">
                          <div className="health-momentum-bar-fill" style={{ height: `${Math.round(ratio * 100)}%` }} />
                        </div>
                        <span>{formatDayLabel(day.date).slice(0, 3)}</span>
                      </div>
                    );
                  });
                })()}
              </div>

              {healthMomentum?.bestDay ? (
                <p className="entity-sub" style={{ marginTop: 8 }}>
                  Best day: {formatDayLabel(healthMomentum.bestDay.date)} · {healthMomentum.bestDay.steps} steps · {healthMomentum.bestDay.calories_burned} cal
                </p>
              ) : (
                <p className="entity-sub" style={{ marginTop: 8 }}>No synced health momentum yet.</p>
              )}
            </section>

            {leaderboardLoading ? (
              <section className="flow-card">
                <div className="feed-skeleton" />
              </section>
            ) : null}

            <section className="flow-card">
              {leaderboard.length === 0 ? (
                <p className="entity-sub">No ranking data yet. Sync health to create your first leaderboard.</p>
              ) : null}
            {leaderboard.map((entry, index) => (
              <div key={entry.id} className="leaderboard-row">
                <div className={`leaderboard-rank ${index < 3 ? 'top' : ''}`}>
                  {index + 1}
                </div>
                <div>
                  <strong>{entry.username}</strong>
                  <p className="entity-sub" style={{ marginTop: 3 }}>{entry.steps || 0} steps · {entry.calories_burned || 0} cal</p>
                </div>
                <div className="leaderboard-score-pill">{(entry.steps || 0) + (entry.calories_burned || 0)}</div>
              </div>
            ))}
            </section>
          </div>
        ) : null}

        {tab === 'profile' ? (
          <div className="tab-content tab-content-profile zym-fade">
            <section className="flow-card flow-card-highlight">
              <div className="profile-hero">
                {profileDraft.background_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveApiAssetUrl(profileDraft.background_url)}
                    alt="Profile cover"
                    className="profile-cover-media"
                  />
                ) : (
                  <div className="profile-cover-fallback" />
                )}
                <div className="profile-hero-overlay">
                  {profileDraft.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveApiAssetUrl(profileDraft.avatar_url)}
                      alt="Profile avatar"
                      className="profile-avatar-media"
                    />
                  ) : (
                    <div className="profile-avatar-fallback">
                      {avatarInitial(authUsername || profile?.username || 'User')}
                    </div>
                  )}
                  <div>
                    <h3 style={{ fontSize: 20 }}>{authUsername || profile?.username || 'User'}</h3>
                    <p className="entity-sub" style={{ marginTop: 4 }}>ID: {authUserId}</p>
                  </div>
                </div>
              </div>

              <div className="profile-hero-actions">
                <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
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
                <button className="btn btn-ghost" type="button" onClick={() => setProfileDraft((prev) => ({ ...prev, avatar_url: '', background_url: '' }))}>
                  Clear media
                </button>
              </div>

              <p className="entity-sub" style={{ marginTop: 8 }}>
                Profile details are visible to your accepted friends in chat.
              </p>

              <div className="profile-coach-switch">
                <button className={`btn ${selectedCoach === 'zj' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => void handleSwitchCoach('zj')}>
                  ZJ coach
                </button>
                <button className={`btn ${selectedCoach === 'lc' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => void handleSwitchCoach('lc')}>
                  LC coach
                </button>
              </div>
            </section>

            <CoachRecordsPanel
              userId={authUserId}
              active={ready && tab === 'profile' && authUserId > 0}
              onNotice={showNotice}
              onError={setError}
            />

            <section className="flow-card form-grid">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 18 }}>Edit profile</h3>
                <p>Changes sync to iOS and web for the same account.</p>
              </div>
              <textarea
                className="input-shell profile-bio-input"
                placeholder="Bio"
                value={profileDraft.bio}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, bio: event.target.value }))}
              />
              <input
                className="input-shell"
                placeholder="Avatar URL (optional)"
                value={profileDraft.avatar_url}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, avatar_url: event.target.value }))}
              />
              <input
                className="input-shell"
                placeholder="Background URL (optional)"
                value={profileDraft.background_url}
                onChange={(event) => setProfileDraft((prev) => ({ ...prev, background_url: event.target.value }))}
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
              <button className="btn btn-primary" disabled={profilePending} onClick={() => void handleSaveProfile()}>
                {profilePending ? 'Saving...' : 'Save'}
              </button>
            </section>

            <section className="flow-card form-grid">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 18 }}>Device sessions</h3>
                <p>Manage where your account is signed in.</p>
              </div>

              <div className="profile-session-actions">
                <button className="btn btn-ghost" onClick={() => void loadAuthSessions()} disabled={authSessionsLoading}>
                  {authSessionsLoading ? 'Refreshing...' : 'Refresh sessions'}
                </button>
                <button
                  className="btn btn-danger-soft"
                  onClick={() => void handleLogoutAllSessions()}
                  disabled={logoutAllSessionsPending}
                >
                  {logoutAllSessionsPending ? 'Processing...' : 'Logout other devices'}
                </button>
              </div>

              {authSessionsLoading && authSessions.length === 0 ? (
                <p className="entity-sub">Loading sessions...</p>
              ) : null}

              {authSessions.map((session) => (
                <article key={session.sessionId} className="profile-session-item">
                  <div>
                    <strong>{session.deviceName || 'Unknown device'}</strong>
                    <p className="entity-sub">
                      {session.ipAddress || 'IP unavailable'} · Last seen {formatSessionDate(session.lastSeenAt)}
                    </p>
                    <p className="entity-sub">
                      Created {formatSessionDate(session.createdAt)} · Expires {formatSessionDate(session.expiresAt)}
                    </p>
                  </div>
                  <div className="profile-session-item-actions">
                    {session.current ? <span className="profile-session-current">Current</span> : null}
                    {!session.current ? (
                      <button
                        className="btn btn-ghost"
                        onClick={() => void handleRevokeSession(session.sessionId)}
                        disabled={authSessionPendingId === session.sessionId || Boolean(session.revokedAt)}
                      >
                        {authSessionPendingId === session.sessionId ? 'Revoking...' : (session.revokedAt ? 'Revoked' : 'Revoke')}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </section>

            <section className="flow-card form-grid">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 18 }}>Security timeline</h3>
                <p>Recent auth and risk-control events for your account.</p>
              </div>

              <button className="btn btn-ghost" onClick={() => void loadSecurityEvents()} disabled={securityEventsLoading}>
                {securityEventsLoading ? 'Refreshing...' : 'Refresh timeline'}
              </button>

              {securityEventsLoading && securityEvents.length === 0 ? (
                <p className="entity-sub">Loading security timeline...</p>
              ) : null}

              {!securityEventsLoading && securityEvents.length === 0 ? (
                <p className="entity-sub">No security events yet.</p>
              ) : null}

              {securityEvents.slice(0, 10).map((event) => (
                <article key={event.id} className={`profile-session-item security-event-item severity-${event.severity}`}>
                  <div>
                    <strong>{eventLabel(event.event_type)}</strong>
                    <p className="entity-sub">
                      {(event.ip_address || 'IP unavailable')} · {(event.user_agent || 'Unknown client').slice(0, 64)}
                    </p>
                    <p className="entity-sub">{formatSessionDate(event.created_at)}</p>
                  </div>
                  <div className="profile-session-item-actions">
                    <span className={`security-event-severity ${event.severity}`}>{event.severity.toUpperCase()}</span>
                  </div>
                </article>
              ))}
            </section>

            <section className="flow-card form-grid">
              <div className="flow-card-head">
                <h3 style={{ fontSize: 18 }}>Safety center</h3>
                <p>Your latest moderation reports.</p>
              </div>

              <button className="btn btn-ghost" onClick={() => void loadAbuseReports()} disabled={abuseReportsLoading}>
                {abuseReportsLoading ? 'Refreshing...' : 'Refresh reports'}
              </button>

              {abuseReports.length === 0 ? (
                <p className="entity-sub">No reports submitted yet.</p>
              ) : null}

              {abuseReports.slice(0, 8).map((report) => (
                <article key={report.id} className="profile-session-item">
                  <div>
                    <strong>{report.target_type} #{report.target_id}</strong>
                    <p className="entity-sub">{report.reason}</p>
                    <p className="entity-sub">{formatSessionDate(report.created_at)} · {report.status}</p>
                  </div>
                </article>
              ))}
            </section>

            <button className="btn btn-danger-soft" onClick={() => void handleLogout()}>
              Logout
            </button>
          </div>
        ) : null}
      </section>

      <section className="surface-card app-panel app-panel-chat zym-enter zym-delay-3">
        {tab === 'messages' ? (
          <>
            <header className="chat-header chat-header-elevated">
              <div className="chat-title-wrap">
                <button
                  type="button"
                  className="chat-profile-btn"
                  onClick={() => void openConversationProfile()}
                  disabled={!activeConversation || activeConversation.type === 'group'}
                  title={activeConversation && activeConversation.type !== 'group' ? 'Open profile' : 'Profile unavailable'}
                >
                  {activeConversation?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveApiAssetUrl(activeConversation.avatarUrl)}
                      alt={activeConversation.name}
                      style={{ width: 52, height: 52, borderRadius: 16, objectFit: 'cover' }}
                    />
                  ) : (
                    <div className={`chat-profile-fallback ${activeConversation?.type === 'coach' ? 'coach' : 'user'}`}>
                      {avatarInitial(activeConversation?.name || 'Chat')}
                    </div>
                  )}
                </button>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: 28 }}>{activeConversation?.name || 'Select a chat'}</h2>
                  <p style={{ marginTop: 6, color: 'var(--ink-500)', fontSize: 13 }}>
                    {activeConversation?.subtitle || 'Conversation'}
                  </p>
                  <div className="chat-meta-badges">
                    <span className="chat-meta-badge">
                      {activeConversation?.type === 'group' ? 'Group room' : 'Direct chat'}
                    </span>
                    {activeConversation?.type === 'coach' ? <span className="chat-meta-badge coach">AI coach</span> : null}
                  </div>
                </div>
              </div>
              <div className="chat-latest-pill chat-latest-pill-elevated">
                {activeConversation?.preview ? `Latest: ${activeConversation.preview}` : 'No messages yet'}
              </div>
            </header>

            {activeConversation?.type === 'group' ? (
              <section className="surface-subtle group-toolbar">
                <div className="group-toolbar-head">
                  <strong style={{ fontSize: 14 }}>Group members</strong>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '6px 10px' }}
                    onClick={() => activeConversation.groupId && void loadActiveGroupMembers(activeConversation.groupId)}
                    disabled={activeGroupMembersPending}
                  >
                    {activeGroupMembersPending ? 'Loading...' : 'Refresh'}
                  </button>
                </div>

                <div className="group-chip-list">
                  {activeGroupMembers.length === 0 ? (
                    <span style={{ color: 'var(--ink-500)', fontSize: 12 }}>No members loaded</span>
                  ) : (
                    activeGroupMembers.map((member) => (
                      <div key={member.id} className="surface-card group-member-chip">
                        <span>{member.username} · {member.role}</span>
                        {activeGroupMyRole === 'owner' && member.role !== 'owner' ? (
                          <button
                            className="btn btn-ghost"
                            type="button"
                            style={{ padding: '2px 6px', minHeight: 22 }}
                            onClick={() => void handleRemoveFromActiveGroup(member)}
                            disabled={activeGroupRemovePendingId === member.id}
                          >
                            {activeGroupRemovePendingId === member.id ? '...' : 'Remove'}
                          </button>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>

                <div className="group-invite-row">
                  <input
                    className="input-shell"
                    placeholder="Invite username"
                    value={activeGroupInvite}
                    onChange={(event) => setActiveGroupInvite(event.target.value)}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => void handleInviteToActiveGroup()}
                    disabled={activeGroupInvitePending}
                  >
                    {activeGroupInvitePending ? 'Inviting...' : 'Invite'}
                  </button>
                </div>
              </section>
            ) : null}

            <div ref={chatStreamRef} className="chat-stream chat-stream-layered">
              {messages.map((message, index) => {
                const mine = message.from_user_id === authUserId;
                const previous = index > 0 ? messages[index - 1] : null;
                const previousDate = previous?.created_at ? new Date(previous.created_at).toDateString() : null;
                const currentDate = message.created_at ? new Date(message.created_at).toDateString() : null;
                const showDateDivider = !previous || previousDate !== currentDate;
                const compact = !!previous && previous.from_user_id === message.from_user_id && !showDateDivider;
                const showMetaLine = !compact || mine;
                const senderLabel = mine ? 'You' : message.username || (activeConversation?.type === 'coach' ? 'Coach' : 'User');
                const avatarText = avatarInitial(message.username || (activeConversation?.type === 'coach' ? 'Coach' : 'User'));

                return (
                  <div key={`${message.id}-${message.created_at}`} className="message-block">
                    {showDateDivider ? (
                      <div className="message-date-divider">
                        <span>{formatDayLabel(message.created_at)}</span>
                      </div>
                    ) : null}

                    <div className={`message-row ${mine ? 'mine' : 'other'} ${compact ? 'compact' : ''}`}>
                      {!mine ? (
                        <div className={`message-avatar ${compact ? 'ghost' : ''}`}>
                          {compact ? '' : avatarText}
                        </div>
                      ) : null}

                      <article
                        className={`chat-bubble ${mine ? 'mine' : 'their'} ${compact ? 'compact' : ''} zym-enter-fast`}
                      >
                        {showMetaLine ? (
                          <div className="message-meta-line">
                            <strong>{senderLabel}</strong>
                            <span>{formatTime(message.created_at)}</span>
                          </div>
                        ) : null}

                        {message.content ? <p className="message-content">{message.content}</p> : null}

                        {message.media_urls?.length > 0 ? (
                          <div className="chat-attachment-grid">
                            {message.media_urls.map((url) => {
                              const mediaUrl = resolveApiAssetUrl(url);
                              if (!mediaUrl) return null;
                              return (
                                <button
                                  key={mediaUrl}
                                  type="button"
                                  className={`chat-attachment-item ${mine ? 'mine' : ''}`}
                                  onClick={() => openMediaLightbox(mediaUrl, `${senderLabel} attachment`)}
                                >
                                  {isVideoUrl(mediaUrl) ? (
                                    <video src={mediaUrl} muted playsInline preload="metadata" style={{ width: '100%', maxHeight: 140 }} />
                                  ) : (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={mediaUrl} alt="attachment" style={{ width: '100%', maxHeight: 170, objectFit: 'cover' }} />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </article>
                    </div>
                  </div>
                );
              })}

              {typingLabel ? (
                <div className="typing-indicator-row zym-fade">
                  <div className="typing-pill">
                    <span>{typingLabel}</span>
                    <span className="typing-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </div>
              ) : null}

              {coachReplyPending ? (
                <div className="typing-indicator-row zym-fade">
                  <div className="typing-pill coach-wait-pill">
                    <span>@coach detected, waiting for reply...</span>
                    <span className="typing-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <footer className="chat-composer chat-composer-elevated">
              <MediaPreviewGrid
                items={attachmentPreviews}
                onRemove={(index) => removeAttachmentAt(index, setAttachments)}
                wrapperClassName="chat-preview-grid"
                itemClassName="chat-preview-item"
              />

              <div className="composer-row composer-row-elevated">
                <div ref={composerMenuRef} className="composer-trigger-wrap">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    style={{ minWidth: 42, display: 'grid', placeItems: 'center' }}
                    onClick={() => setComposerActionsOpen((prev) => !prev)}
                    aria-label="Open attachment actions"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                  {composerActionsOpen ? (
                    <div
                      className="surface-card composer-action-menu"
                    >
                      <label className="btn btn-ghost" style={{ cursor: 'pointer', justifyContent: 'flex-start' }}>
                        Photo / Video
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
                  className="input-shell composer-input"
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  placeholder="Type a message... (use @coach in groups to trigger AI reply)"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                />
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
                <button className="btn btn-primary composer-send-btn" disabled={pendingSend || !isOnline} onClick={() => void handleSendMessage()}>
                  {pendingSend ? 'Sending...' : 'Send'}
                </button>
              </div>

              <p className="composer-hint">
                {attachments.length > 0
                  ? `${attachments.length}/${MAX_MEDIA_ATTACHMENTS} file(s) ready`
                  : 'Supports images and videos up to 50MB each'}
              </p>
              {!isOnline ? (
                <p className="composer-hint" style={{ marginTop: 4, color: 'var(--danger)' }}>
                  Reconnect to send messages and media.
                </p>
              ) : null}
              {activeConversation?.type === 'group' ? (
                <p className="composer-hint" style={{ marginTop: 4 }}>
                  {activeConversation.coachEnabled === 'none'
                    ? 'Coach disabled in this group.'
                    : 'Coach replies only when you mention @coach.'}
                </p>
              ) : null}
            </footer>
          </>
        ) : (
          <div className="insight-panel-shell">
            <div className="insight-panel-card">
              <h2 style={{ fontSize: 34 }}>{tabs.find((item) => item.key === tab)?.label}</h2>
              <p className="entity-sub" style={{ marginTop: 8 }}>
                Live summary and quick hints for this module.
              </p>

              {tab === 'feed' ? (
                <div className="insight-grid">
                  <div className="insight-chip">
                    <strong>{feed.length}</strong>
                    <span>Total posts</span>
                  </div>
                  <div className="insight-chip">
                    <strong>{feed.reduce((sum, post) => sum + (post.reaction_count || 0), 0)}</strong>
                    <span>Total likes</span>
                  </div>
                </div>
              ) : null}

              {tab === 'friends' ? (
                <div className="insight-grid">
                  <div className="insight-chip">
                    <strong>{friends.length}</strong>
                    <span>Friends</span>
                  </div>
                  <div className="insight-chip">
                    <strong>{requests.length}</strong>
                    <span>Pending requests</span>
                  </div>
                </div>
              ) : null}

              {tab === 'leaderboard' ? (
                <div className="insight-grid">
                  <div className="insight-chip">
                    <strong>{leaderboard.length}</strong>
                    <span>Ranked users</span>
                  </div>
                  <div className="insight-chip">
                    <strong>{leaderboard[0]?.username || '-'}</strong>
                    <span>Current #1</span>
                  </div>
                </div>
              ) : null}

              {tab === 'profile' ? (
                <div className="insight-grid">
                  <div className="insight-chip">
                    <strong>{selectedCoach.toUpperCase()}</strong>
                    <span>Selected coach</span>
                  </div>
                  <div className="insight-chip">
                    <strong>{profileDraft.bio.trim() ? 'Ready' : 'Draft'}</strong>
                    <span>Profile status</span>
                  </div>
                </div>
              ) : null}

              <p className="entity-sub">
                Tip: use the middle panel for editing and actions. This right panel is optimized for context and status.
              </p>
            </div>
          </div>
        )}
      </section>

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
                <div className="flow-card flow-card-soft form-grid">
                  <strong style={{ fontSize: 18 }}>{coachDisplayName(profileViewer.coachId || selectedCoach)}</strong>
                  <p style={{ color: 'var(--ink-500)', lineHeight: 1.5 }}>
                    {profileViewer.coachId === 'lc'
                      ? 'Strict coaching style with direct accountability. Best for users who want hard feedback and action-first guidance.'
                      : 'Encouraging coaching style focused on consistency, progressive habits, and sustainable fitness routines.'}
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
                    <div style={{ width: '100%', height: 170, background: 'linear-gradient(120deg, #dce9df, #edf5ef)' }} />
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
                        background: 'linear-gradient(135deg, #5f6e5f, #4d5b4d)',
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
                      void submitAbuseReport(
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
              {mediaLightbox.isVideo ? (
                <video src={mediaLightbox.url} controls autoPlay style={{ width: '100%', maxHeight: '70vh', borderRadius: 12 }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaLightbox.url} alt={mediaLightbox.label} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 12 }} />
              )}
            </div>
          </div>
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
    </main>
  );
}

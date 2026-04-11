import { API_BASE_URL, resolveApiAssetUrl } from './config';
import { clearAuth, getAuth, setAuthTokens } from './auth-storage';
import {
  AbuseReport,
  AuthSession,
  CoachTrainingPlanResponse,
  CoachRecordsResponse,
  FeedComment,
  ChatMessage,
  FeedResponse,
  FriendsResponse,
  GroupMember,
  GroupResponse,
  HealthMomentumResponse,
  InboxResponse,
  LeaderboardResponse,
  MentionNotification,
  PublicProfileResponse,
  PublicUser,
  Profile,
  SecurityEvent,
  RequestsResponse,
  UserSummary,
} from './types';

function handleUnauthorized(path: string) {
  if (typeof window === 'undefined') return;
  clearAuth();
  window.dispatchEvent(new CustomEvent('zym-auth-expired', { detail: { path } }));
}

function handleForbiddenUserScope(path: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('zym-auth-scope-mismatch', { detail: { path } }));
}

function detectClientTimeZone(): string | undefined {
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') return undefined;
  try {
    const timezone = String(Intl.DateTimeFormat().resolvedOptions().timeZone || '').trim();
    return timezone || undefined;
  } catch {
    return undefined;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

function buildHeaders(initHeaders?: HeadersInit, includeJsonContentType = true): Headers {
  const headers = new Headers(initHeaders || {});

  if (includeJsonContentType && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (typeof window !== 'undefined' && !headers.has('Authorization')) {
    const token = localStorage.getItem('token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return headers;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildHeaders(init?.headers, true),
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401 && path !== '/auth/refresh') {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryResponse = await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: buildHeaders(init?.headers, true),
      });

      const retryPayload = await retryResponse.json().catch(() => ({}));
      if (!retryResponse.ok) {
        if (retryResponse.status === 401) {
          handleUnauthorized(path);
        }
        if (retryResponse.status === 403 && retryPayload?.error === 'Forbidden user scope') {
          handleForbiddenUserScope(path);
        }
        throw new Error(retryPayload?.error || 'Request failed');
      }
      return retryPayload as T;
    }
    handleUnauthorized(path);
  }

  if (!response.ok) {
    if (response.status === 403 && payload?.error === 'Forbidden user scope') {
      handleForbiddenUserScope(path);
    }
    const message = payload?.error || 'Request failed';
    throw new Error(message);
  }

  return payload as T;
}

async function refreshAccessToken(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (refreshInFlight) return refreshInFlight;

  const auth = getAuth();
  if (!auth?.refreshToken) return false;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          refreshToken: auth.refreshToken,
          timezone: detectClientTimeZone(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.token || !payload?.refreshToken) {
        if (response.status === 401) {
          clearAuth();
        }
        return false;
      }

      setAuthTokens(String(payload.token), String(payload.refreshToken));
      window.dispatchEvent(new CustomEvent('zym-auth-refreshed', {
        detail: {
          token: String(payload.token),
          refreshToken: String(payload.refreshToken),
        },
      }));
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export interface LoginResponse {
  userId: number;
  token: string;
  refreshToken: string;
  username: string;
  selectedCoach: 'zj' | 'lc' | null;
  enabledCoaches?: Array<'zj' | 'lc'>;
  timezone?: string | null;
}

export async function login(identifier: string, password: string, timezone?: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      identifier,
      password,
      timezone: timezone || detectClientTimeZone(),
    }),
  });
}

export async function loginWithGoogle(
  idToken: string,
  options?: {
    timezone?: string;
    healthDisclaimerAccepted?: boolean;
    consentVersion?: string;
  },
): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({
      idToken,
      timezone: options?.timezone || detectClientTimeZone(),
      healthDisclaimerAccepted: options?.healthDisclaimerAccepted,
      consentVersion: options?.consentVersion,
    }),
  });
}

export async function register(
  username: string,
  email: string,
  password: string,
  options: {
    healthDisclaimerAccepted: boolean;
    consentVersion: string;
  },
): Promise<{ userId: number }> {
  return request<{ userId: number }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      email,
      password,
      healthDisclaimerAccepted: options.healthDisclaimerAccepted,
      consentVersion: options.consentVersion,
    }),
  });
}

export async function requestEmailVerification(email: string): Promise<{ ok: boolean; message?: string }> {
  return request<{ ok: boolean; message?: string }>('/auth/verify-email/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyEmail(token: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/verify-email/confirm', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message?: string }> {
  return request<{ ok: boolean; message?: string }>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function selectCoach(userId: number, coach: 'zj' | 'lc'): Promise<void> {
  await request('/coach/select', {
    method: 'POST',
    body: JSON.stringify({ userId, coach }),
  });
}

export async function enableCoach(userId: number, coach: 'zj' | 'lc'): Promise<{
  success: true;
  coach: 'zj' | 'lc';
  selectedCoach: 'zj' | 'lc' | null;
  enabledCoaches: Array<'zj' | 'lc'>;
}> {
  return request('/coach/enable', {
    method: 'POST',
    body: JSON.stringify({ userId, coach }),
  });
}

export async function searchUsers(query: string): Promise<UserSummary[]> {
  const result = await request<{ users: UserSummary[] }>(`/users/search?q=${encodeURIComponent(query)}`);
  return result.users;
}

export async function getInbox(userId: number): Promise<InboxResponse> {
  return request<InboxResponse>(`/messages/inbox/${userId}`);
}

export async function getMessages(topic: string): Promise<ChatMessage[]> {
  const response = await request<{ messages: ChatMessage[] }>(`/messages/${encodeURIComponent(topic)}`);
  return response.messages;
}

export async function openDM(userId: number, otherUserId: number): Promise<string> {
  const response = await request<{ topic: string }>('/messages/open-dm', {
    method: 'POST',
    body: JSON.stringify({ userId, otherUserId }),
  });
  return response.topic;
}

export async function sendMessage(payload: {
  fromUserId: number;
  topic: string;
  content?: string;
  mediaUrls?: string[];
  mediaIds?: string[];
  replyTo?: number;
  clientMessageId?: string;
}): Promise<{
  success: true;
  messageId: number;
  clientMessageId?: string | null;
  message?: ChatMessage | null;
}> {
  return request('/messages/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function markMessagesRead(payload: {
  userId: number;
  topic: string;
  messageId?: number;
}): Promise<void> {
  await request('/messages/read', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface UploadedMedia {
  url: string;
  mediaId?: string | null;
  assetId?: string | null;
}

export type MediaVisibility = 'private' | 'friends' | 'public';
export type PostVisibility = 'private' | 'friends' | 'public';

interface UploadFileOptions {
  source?: string;
  visibility?: MediaVisibility;
}

interface MediaUploadIntentResponse {
  strategy?: 'legacy_multipart' | 'direct' | 'presigned';
  assetId?: string;
  upload?: {
    method: 'PUT';
    url: string;
    headers?: Record<string, string>;
  };
  path?: string;
  url?: string;
}

async function uploadFileLegacy(file: File, options: UploadFileOptions = {}): Promise<UploadedMedia> {
  const body = new FormData();
  body.append('file', file);
  if (options.source) {
    body.append('source', options.source);
  }
  if (options.visibility) {
    body.append('visibility', options.visibility);
  }

  let response = await fetch(`${API_BASE_URL}/media/upload`, {
    method: 'POST',
    body,
    headers: buildHeaders(undefined, false),
  });

  let payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await fetch(`${API_BASE_URL}/media/upload`, {
        method: 'POST',
        body,
        headers: buildHeaders(undefined, false),
      });
      payload = await response.json().catch(() => ({}));
    } else {
      handleUnauthorized('/media/upload');
    }
  }
  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized('/media/upload');
    }
    throw new Error(payload?.error || 'Upload failed');
  }

  const rawUrl = String(payload.url || payload.path || '').trim();
  const resolvedUrl = resolveApiAssetUrl(rawUrl);

  return {
    url: resolvedUrl || rawUrl,
    mediaId: payload.mediaId || null,
    assetId: payload.assetId || null,
  };
}

function shouldUseAuthForUploadTarget(targetUrl: string): boolean {
  try {
    const uploadUrl = new URL(targetUrl, API_BASE_URL);
    const apiUrl = new URL(API_BASE_URL);
    return uploadUrl.origin === apiUrl.origin;
  } catch {
    return false;
  }
}

export async function uploadFile(file: File, options: UploadFileOptions = {}): Promise<UploadedMedia> {
  const intent = await request<MediaUploadIntentResponse>('/media/upload-url', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      source: options.source || 'web',
      visibility: options.visibility || 'private',
    }),
  }).catch(() => null);

  if (!intent || intent.strategy === 'legacy_multipart' || !intent.assetId || !intent.upload?.url) {
    return uploadFileLegacy(file, options);
  }

  const uploadHeaders = new Headers(intent.upload.headers || {});
  if (!uploadHeaders.has('Content-Type')) {
    uploadHeaders.set('Content-Type', file.type || 'application/octet-stream');
  }
  if (shouldUseAuthForUploadTarget(intent.upload.url)) {
    const authHeaders = buildHeaders(undefined, false);
    const auth = authHeaders.get('Authorization');
    if (auth && !uploadHeaders.has('Authorization')) {
      uploadHeaders.set('Authorization', auth);
    }
  }

  const uploadResponse = await fetch(intent.upload.url, {
    method: intent.upload.method || 'PUT',
    headers: uploadHeaders,
    body: file,
  });

  if (!uploadResponse.ok) {
    return uploadFileLegacy(file, options);
  }

  const finalized = await request<{
    assetId: string;
    mediaId: string;
    path: string;
    url?: string;
  }>('/media/finalize', {
    method: 'POST',
    body: JSON.stringify({ assetId: intent.assetId }),
  });

  const rawUrl = String(finalized.url || finalized.path || '').trim();
  const resolvedUrl = resolveApiAssetUrl(rawUrl);
  return {
    url: resolvedUrl || rawUrl,
    mediaId: finalized.mediaId || finalized.assetId || null,
    assetId: finalized.assetId || null,
  };
}

export async function getFriends(userId: number): Promise<FriendsResponse> {
  return request<FriendsResponse>(`/friends/${userId}`);
}

export async function getFriendRequests(userId: number): Promise<RequestsResponse> {
  return request<RequestsResponse>(`/friends/requests/${userId}`);
}

export async function addFriend(payload: { userId: number; friendId?: number; username?: string; connectCode?: string }): Promise<void> {
  await request('/friends/add', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getUserPublic(userId: number): Promise<PublicUser> {
  return request<PublicUser>(`/users/public/${userId}`);
}

export async function getFriendConnectCode(userId: number): Promise<{
  userId: number;
  connectId: string;
  connectCode: string;
  token: string;
  ttlSeconds: number;
  expiresAt: string;
}> {
  return request<{
    userId: number;
    connectId: string;
    connectCode: string;
    token: string;
    ttlSeconds: number;
    expiresAt: string;
  }>(`/friends/connect/${userId}`);
}

export async function resolveFriendConnectCode(connectCode: string): Promise<{ userId: number; username: string }> {
  return request<{ userId: number; username: string }>('/friends/resolve-connect', {
    method: 'POST',
    body: JSON.stringify({ connectCode }),
  });
}

export async function acceptFriend(userId: number, friendId: number): Promise<void> {
  await request('/friends/accept', {
    method: 'POST',
    body: JSON.stringify({ userId, friendId }),
  });
}

export async function getGroups(userId: number): Promise<GroupResponse> {
  return request<GroupResponse>(`/groups/user/${userId}`);
}

export async function createGroup(payload: { name: string; ownerId: number; coachEnabled: 'none' | 'zj' | 'lc' }): Promise<number> {
  const response = await request<{ groupId: number }>('/groups/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.groupId;
}

export async function addGroupMember(payload: { groupId: number; userId?: number; username?: string }): Promise<void> {
  await request('/groups/add-member', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function removeGroupMember(payload: { groupId: number; userId?: number; username?: string }): Promise<void> {
  await request('/groups/remove-member', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getGroupMembers(groupId: number): Promise<GroupMember[]> {
  const response = await request<{ members: GroupMember[] }>(`/groups/${groupId}/members`);
  return response.members;
}

export async function getFeed(userId: number): Promise<FeedResponse> {
  return request<FeedResponse>(`/community/feed/${userId}`);
}

export async function createPost(payload: {
  userId: number;
  type: string;
  content: string;
  mediaUrls: string[];
  mediaIds?: string[];
  visibility?: PostVisibility;
}): Promise<void> {
  await request('/community/post', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePostVisibility(payload: {
  userId: number;
  postId: number;
  visibility: PostVisibility;
}): Promise<void> {
  await request('/community/post/visibility', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deletePost(payload: {
  userId: number;
  postId: number;
}): Promise<void> {
  await request('/community/post/delete', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function reactToPost(postId: number, userId: number, reactionType = 'like'): Promise<void> {
  await request('/community/react', {
    method: 'POST',
    body: JSON.stringify({ postId, userId, reactionType }),
  });
}

export async function getPostComments(postId: number): Promise<FeedComment[]> {
  const response = await request<{ comments: FeedComment[] }>(`/community/post/${postId}/comments`);
  return response.comments;
}

export async function createPostComment(payload: {
  postId: number;
  userId: number;
  content: string;
}): Promise<void> {
  await request('/community/comment', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getMentionNotifications(userId: number): Promise<MentionNotification[]> {
  const response = await request<{ mentions: MentionNotification[] }>(`/notifications/mentions/${userId}`);
  return response.mentions;
}

export async function markMentionNotificationsRead(payload: {
  userId: number;
  ids?: number[];
}): Promise<void> {
  await request('/notifications/mentions/read', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getLeaderboard(userId: number): Promise<LeaderboardResponse> {
  return request<LeaderboardResponse>(`/health/leaderboard/${userId}`);
}

export async function getHealthMomentum(userId: number): Promise<HealthMomentumResponse> {
  return request<HealthMomentumResponse>(`/health/momentum/${userId}`);
}

export async function syncHealth(payload: { userId: number; steps: number; calories: number }): Promise<void> {
  await request('/health/sync', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getProfile(userId: number): Promise<Profile> {
  return request<Profile>(`/profile/${userId}`);
}

export async function getPublicProfile(userId: number): Promise<PublicProfileResponse> {
  return request<PublicProfileResponse>(`/profile/public/${userId}`);
}

export async function updateProfile(payload: {
  userId: number;
  bio?: string;
  fitness_goal?: string;
  hobbies?: string;
  avatar_url?: string;
  avatar_visibility?: MediaVisibility;
  background_url?: string;
  background_visibility?: MediaVisibility;
  timezone?: string;
}): Promise<void> {
  await request('/profile/update', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getCoachRecords(userId: number, days = 21): Promise<CoachRecordsResponse> {
  const safeDays = Math.min(120, Math.max(1, Math.floor(Number(days) || 21)));
  return request<CoachRecordsResponse>(`/coach/records/${userId}?days=${safeDays}`);
}

export async function updateCoachRecordProfile(payload: {
  userId: number;
  height?: string;
  weight?: string;
  height_cm?: number;
  weight_kg?: number;
  age?: number;
  body_fat_pct?: number;
  training_days?: number;
  gender?: string;
  activity_level?: string;
  goal?: string;
  experience_level?: string;
  notes?: string;
  timezone?: string;
  seed_initial_check_in?: boolean;
}): Promise<void> {
  await request('/coach/records/profile/update', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCoachMealRecord(payload: {
  userId: number;
  day: string;
  mealId: string;
  description?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  time?: string;
  timezone?: string;
  occurredAtUtc?: string | null;
}): Promise<void> {
  await request('/coach/records/meal/update', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCoachCheckInRecord(payload: {
  userId: number;
  day?: string;
  timezone?: string;
  occurredAtUtc?: string | null;
  weight_kg?: number;
  body_fat_pct?: number;
  waist_cm?: number;
  energy?: number;
  hunger?: number;
  recovery?: number;
  adherence?: 'on_track' | 'partial' | 'off_track';
  notes?: string;
}): Promise<void> {
  await request('/coach/records/check-in/update', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCoachTrainingRecord(payload: {
  userId: number;
  day: string;
  trainingId: string;
  name?: string;
  sets?: number;
  reps?: string;
  weight_kg?: number;
  notes?: string;
  time?: string;
  timezone?: string;
  occurredAtUtc?: string | null;
}): Promise<void> {
  await request('/coach/records/training/update', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getCoachTrainingPlan(userId: number, day?: string): Promise<CoachTrainingPlanResponse> {
  const params = new URLSearchParams();
  if (day) {
    params.set('day', day);
  }
  const query = params.toString();
  return request<CoachTrainingPlanResponse>(`/coach/training-plan/${userId}${query ? `?${query}` : ''}`);
}

export async function toggleCoachTrainingPlanExercise(payload: {
  userId: number;
  day: string;
  exerciseId: string;
  completed: boolean;
  occurredAtUtc?: string;
  timezone?: string;
}): Promise<CoachTrainingPlanResponse & { completed: boolean }> {
  return request<CoachTrainingPlanResponse & { completed: boolean }>('/coach/training-plan/toggle', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      timezone: payload.timezone || detectClientTimeZone(),
    }),
  });
}

export async function createAbuseReport(payload: {
  userId: number;
  targetType: 'user' | 'post' | 'message' | 'group';
  targetId: number;
  reason: string;
  details?: string;
}): Promise<number> {
  const response = await request<{ reportId: number }>('/moderation/report', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.reportId;
}

export async function getAbuseReports(userId: number): Promise<AbuseReport[]> {
  const response = await request<{ reports: AbuseReport[] }>(`/moderation/reports/${userId}`);
  return response.reports;
}

export async function getSecurityEvents(userId: number, limit = 50): Promise<SecurityEvent[]> {
  const safeLimit = Math.min(120, Math.max(1, Math.floor(Number(limit) || 50)));
  const response = await request<{ events: SecurityEvent[] }>(`/security/events/${userId}?limit=${safeLimit}`);
  return response.events;
}

export async function logoutSession(): Promise<void> {
  await request('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function logoutAllSessions(): Promise<void> {
  await request('/auth/logout-all', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function deleteAccount(userId: number): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/delete-account', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function getAuthSessions(): Promise<AuthSession[]> {
  const response = await request<{ sessions: AuthSession[] }>('/auth/sessions');
  return response.sessions;
}

export async function revokeAuthSession(sessionId: string): Promise<void> {
  await request('/auth/sessions/revoke', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

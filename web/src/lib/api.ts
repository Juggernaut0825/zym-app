import { API_BASE_URL } from './config';
import { clearAuth } from './auth-storage';
import {
  ChatMessage,
  FeedResponse,
  FriendsResponse,
  GroupMember,
  GroupResponse,
  InboxResponse,
  LeaderboardResponse,
  PublicProfileResponse,
  PublicUser,
  Profile,
  RequestsResponse,
  UserSummary,
} from './types';

function handleUnauthorized(path: string) {
  if (typeof window === 'undefined') return;
  clearAuth();
  window.dispatchEvent(new CustomEvent('zym-auth-expired', { detail: { path } }));
}

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
  if (response.status === 401) {
    handleUnauthorized(path);
  }
  if (!response.ok) {
    const message = payload?.error || 'Request failed';
    throw new Error(message);
  }

  return payload as T;
}

export interface LoginResponse {
  userId: number;
  token: string;
  username: string;
  selectedCoach: 'zj' | 'lc';
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function register(username: string, email: string, password: string): Promise<{ userId: number }> {
  return request<{ userId: number }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
}

export async function selectCoach(userId: number, coach: 'zj' | 'lc'): Promise<void> {
  await request('/coach/select', {
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
}): Promise<void> {
  await request('/messages/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface UploadedMedia {
  url: string;
  mediaId?: string | null;
}

export async function uploadFile(file: File): Promise<UploadedMedia> {
  const body = new FormData();
  body.append('file', file);

  const response = await fetch(`${API_BASE_URL}/media/upload`, {
    method: 'POST',
    body,
    headers: buildHeaders(undefined, false),
  });

  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    handleUnauthorized('/media/upload');
  }
  if (!response.ok) {
    throw new Error(payload?.error || 'Upload failed');
  }

  return {
    url: payload.url || payload.path,
    mediaId: payload.mediaId || null,
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
}): Promise<void> {
  await request('/community/post', {
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

export async function getLeaderboard(userId: number): Promise<LeaderboardResponse> {
  return request<LeaderboardResponse>(`/health/leaderboard/${userId}`);
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
  background_url?: string;
}): Promise<void> {
  await request('/profile/update', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

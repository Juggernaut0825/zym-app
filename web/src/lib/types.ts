export interface AuthPayload {
  userId: number;
  token: string;
  username: string;
  selectedCoach: 'zj' | 'lc';
}

export interface UserSummary {
  id: number;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  fitness_goal?: string | null;
}

export interface PublicUser extends UserSummary {
  friendship_status: 'self' | 'none' | 'pending' | 'accepted' | 'blocked';
}

export interface InboxCoach {
  topic: string;
  last_message_at: string | null;
  last_message_preview: string;
}

export interface InboxDM {
  topic: string;
  other_user_id: string;
  username: string;
  avatar_url: string | null;
  last_message_at: string | null;
  last_message_preview: string;
}

export interface InboxGroup {
  id: number;
  topic: string;
  name: string;
  coach_enabled: string;
  last_message_at: string | null;
  last_message_preview: string;
}

export interface InboxResponse {
  coach: InboxCoach;
  dms: InboxDM[];
  groups: InboxGroup[];
}

export interface ChatMessage {
  id: number;
  topic: string;
  from_user_id: number;
  content: string | null;
  media_urls: string[];
  mentions: string[];
  reply_to: number | null;
  created_at: string;
  username: string;
  avatar_url: string | null;
  is_coach: boolean;
}

export interface Friend {
  id: number;
  username: string;
  avatar_url: string | null;
}

export interface FriendsResponse {
  friends: Friend[];
}

export interface RequestsResponse {
  requests: Friend[];
}

export interface GroupMember {
  id: number;
  username: string;
  avatar_url: string | null;
  role: string;
}

export interface GroupResponse {
  groups: Array<{ id: number; name: string; coach_enabled: string; last_message_at: string | null }>;
}

export interface FeedPost {
  id: number;
  user_id: number;
  type: string;
  content: string | null;
  username: string;
  avatar_url: string | null;
  reaction_count: number;
  media_urls: string[];
  created_at: string;
}

export interface FeedResponse {
  feed: FeedPost[];
}

export interface LeaderboardEntry {
  id: number;
  username: string;
  avatar_url: string | null;
  steps: number | null;
  calories_burned: number | null;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
}

export interface Profile {
  id: number;
  username: string;
  avatar_url: string | null;
  background_url: string | null;
  bio: string | null;
  fitness_goal: string | null;
  hobbies: string | null;
  selected_coach: 'zj' | 'lc';
}

export interface PublicProfilePost {
  id: number;
  user_id: number;
  type: string;
  content: string | null;
  media_urls: string[];
  reaction_count: number;
  created_at: string;
}

export interface PublicHealthSnapshot {
  date: string;
  steps: number;
  calories_burned: number;
  active_minutes: number;
  synced_at: string;
}

export interface PublicProfileResponse {
  visibility: 'full' | 'limited';
  isFriend: boolean;
  profile: Profile;
  today_health: PublicHealthSnapshot | null;
  recent_posts: PublicProfilePost[];
}

export interface MessageSocketEvent {
  type: 'message_created';
  topic: string;
  message: ChatMessage;
}

export interface TypingSocketEvent {
  type: 'typing';
  topic: string;
  userId: string;
  isTyping: boolean;
}

export interface InboxUpdateSocketEvent {
  type: 'inbox_updated';
}

export type AppSocketEvent = MessageSocketEvent | TypingSocketEvent | InboxUpdateSocketEvent;

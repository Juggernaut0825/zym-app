export interface AuthPayload {
  userId: number;
  token: string;
  refreshToken: string;
  username: string;
  selectedCoach: 'zj' | 'lc' | null;
}

export interface AuthSession {
  sessionId: string;
  deviceName: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  current: boolean;
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
  unread_count?: number;
  mention_count?: number;
}

export interface InboxDM {
  topic: string;
  other_user_id: string;
  username: string;
  avatar_url: string | null;
  last_message_at: string | null;
  last_message_preview: string;
  unread_count?: number;
  mention_count?: number;
}

export interface InboxGroup {
  id: number;
  topic: string;
  name: string;
  coach_enabled: string;
  last_message_at: string | null;
  last_message_preview: string;
  unread_count?: number;
  mention_count?: number;
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
  visibility?: 'private' | 'friends' | 'public';
  content: string | null;
  username: string;
  avatar_url: string | null;
  reaction_count: number;
  comment_count?: number;
  media_urls: string[];
  created_at: string;
}

export interface FeedComment {
  id: number;
  post_id: number;
  user_id: number;
  username: string;
  avatar_url: string | null;
  content: string;
  created_at: string;
}

export interface MentionNotification {
  id: number;
  topic: string | null;
  message_id: number | null;
  source_type: 'message' | 'post_comment';
  source_id: number;
  snippet: string;
  is_read: boolean;
  created_at: string;
  actor_user_id: number | null;
  actor_username: string | null;
}

export interface AbuseReport {
  id: number;
  reporter_user_id: number;
  target_type: 'user' | 'post' | 'message' | 'group';
  target_id: number;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

export interface SecurityEvent {
  id: number;
  user_id: number | null;
  session_id: string | null;
  event_type: string;
  severity: 'info' | 'warn' | 'high';
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
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

export interface HealthMomentumPoint {
  date: string;
  steps: number;
  calories_burned: number;
  active_minutes: number;
  score: number;
}

export interface HealthMomentumResponse {
  today: HealthMomentumPoint | null;
  last7Days: HealthMomentumPoint[];
  totals: {
    steps: number;
    calories_burned: number;
    active_minutes: number;
  };
  averages: {
    steps: number;
    calories_burned: number;
    active_minutes: number;
  };
  activityDays: number;
  streakDays: number;
  trend: {
    direction: 'up' | 'down' | 'flat';
    delta: number;
  };
  bestDay: HealthMomentumPoint | null;
}

export interface Profile {
  id: number;
  username: string;
  avatar_url: string | null;
  background_url: string | null;
  bio: string | null;
  fitness_goal: string | null;
  hobbies: string | null;
  selected_coach: 'zj' | 'lc' | null;
  timezone?: string | null;
}

export interface PublicProfilePost {
  id: number;
  user_id: number;
  type: string;
  visibility?: 'private' | 'friends' | 'public';
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

export interface CoachProfileData {
  height?: string | null;
  weight?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  age?: number;
  body_fat_pct?: number;
  training_days?: number;
  gender?: string | null;
  activity_level?: string | null;
  goal?: string | null;
  experience_level?: string | null;
  notes?: string | null;
  timezone?: string;
  bmr?: number;
  tdee?: number;
  daily_target?: number;
  [key: string]: unknown;
}

export interface CoachMealRecord {
  id: string;
  time?: string;
  timezone?: string;
  occurred_at_utc?: string | null;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  description?: string;
  items?: Array<{
    food?: string;
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    portion?: string;
  }>;
}

export interface CoachTrainingRecord {
  id: string;
  time?: string;
  timezone?: string;
  occurred_at_utc?: string | null;
  name?: string;
  sets?: number;
  reps?: string;
  weight_kg?: number;
  volume_kg?: number;
  notes?: string;
}

export interface CoachDayRecord {
  day: string;
  total_intake: number;
  total_burned: number;
  meals: CoachMealRecord[];
  training: CoachTrainingRecord[];
}

export interface CoachRecordsResponse {
  profile: CoachProfileData;
  records: CoachDayRecord[];
  stats: {
    days: number;
    mealCount: number;
    trainingCount: number;
  };
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

export interface CoachStatusSocketEvent {
  type: 'coach_status';
  topic: string;
  phase: string;
  label: string;
  active: boolean;
  tool?: string;
}

export interface InboxUpdateSocketEvent {
  type: 'inbox_updated';
}

export interface FriendsUpdatedSocketEvent {
  type: 'friends_updated';
}

export type AppSocketEvent =
  | MessageSocketEvent
  | TypingSocketEvent
  | CoachStatusSocketEvent
  | InboxUpdateSocketEvent
  | FriendsUpdatedSocketEvent;

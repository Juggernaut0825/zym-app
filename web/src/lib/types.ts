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
  client_message_id?: string | null;
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
  starting_weight_kg?: number | null;
  height_cm?: number | null;
  heightCm?: number | string | null;
  weight_kg?: number | null;
  weightKg?: number | string | null;
  age?: number;
  ageYears?: number;
  body_fat_pct?: number;
  bodyFatPct?: number;
  training_days?: number;
  trainingDays?: number;
  gender?: string | null;
  sex?: string | null;
  activity_level?: string | null;
  activityLevel?: string | null;
  goal?: string | null;
  fitness_goal?: string | null;
  fitnessGoal?: string | null;
  experience_level?: string | null;
  experienceLevel?: string | null;
  notes?: string | null;
  timezone?: string;
  timeZone?: string;
  latest_checkin_at?: string | null;
  bmr?: number;
  tdee?: number;
  daily_target?: number;
  progress_summary?: CoachProgressSummary;
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
  source_plan_id?: string;
  source_exercise_id?: string;
  from_plan?: boolean;
}

export interface CoachTrainingPlanExercise {
  id: string;
  exercise_key?: string;
  order: number;
  name: string;
  sets: number;
  reps: string;
  rest_seconds: number;
  target_weight_kg?: number | null;
  cue?: string;
  notes?: string;
  demo_url?: string;
  demo_thumbnail?: string;
  completed_at?: string | null;
}

export interface CoachTrainingPlan {
  id: string;
  day: string;
  coach_id: 'zj' | 'lc';
  title: string;
  summary: string;
  timezone: string;
  created_at: string;
  updated_at: string;
  exercises: CoachTrainingPlanExercise[];
}

export interface CoachTrainingPlanResponse {
  day: string;
  timezone: string;
  plan: CoachTrainingPlan | null;
}

export interface CoachCheckInRecord {
  weight_kg?: number | null;
  body_fat_pct?: number | null;
  waist_cm?: number | null;
  energy?: number | null;
  hunger?: number | null;
  recovery?: number | null;
  adherence?: 'on_track' | 'partial' | 'off_track' | null;
  notes?: string | null;
  timezone?: string | null;
  occurred_at_utc?: string | null;
  logged_at?: string | null;
}

export interface CoachProgressSummary {
  latestCheckInDay: string | null;
  latestCheckInAt: string | null;
  latestWeightDay: string | null;
  latestWeightKg: number | null;
  latestBodyFatPct: number | null;
  latestWaistCm: number | null;
  weight7dAvg: number | null;
  weight14dDelta: number | null;
  weight30dDelta: number | null;
  avgEnergy7d: number | null;
  avgHunger7d: number | null;
  avgRecovery7d: number | null;
  adherence7d: 'on_track' | 'partial' | 'off_track' | 'mixed' | 'unknown';
  lastBodyFatDay: string | null;
  lastWaistDay: string | null;
  checkInDays: number;
  trendLine: 'down' | 'up' | 'flat' | 'unknown';
  status: 'on_track' | 'watch' | 'off_track' | 'insufficient_data';
  statusLabel: string;
  trendNarrative: string;
}

export interface CoachDayRecord {
  day: string;
  total_intake: number;
  total_burned: number;
  check_in?: CoachCheckInRecord | null;
  meals: CoachMealRecord[];
  training: CoachTrainingRecord[];
}

export interface CoachRecordsResponse {
  selectedCoach?: 'zj' | 'lc' | null;
  profile: CoachProfileData;
  progress?: CoachProgressSummary;
  records: CoachDayRecord[];
  stats: {
    days: number;
    mealCount: number;
    trainingCount: number;
    checkInCount?: number;
  };
}

export interface MessageSocketEvent {
  type: 'message_created';
  topic: string;
  message: ChatMessage;
  clientMessageId?: string | null;
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

export type CoachPersona = 'zj' | 'lc';
export type PostType = 'workout' | 'meal' | 'text' | 'progress';
export type ReactionType = 'like' | 'fire' | 'strong' | 'clap';

export interface UserProfile {
  height?: number;
  weight?: number;
  age?: number;
  gender?: 'male' | 'female';
  bodyFat?: number;
  activityLevel?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal?: 'bulk' | 'cut' | 'maintain';
  bmr?: number;
  tdee?: number;
  dietaryPreferences?: string[];
  allergies?: string[];
  injuries?: string[];
}

export interface Message {
  id: number;
  topic: string;
  from_user_id: number;
  content: string;
  mentions?: number[];
  reply_to?: number;
  created_at: Date;
}

export interface ActivityPost {
  id: number;
  user_id: number;
  content?: string;
  post_type: PostType;
  media_urls?: string[];
  metadata?: any;
  created_at: Date;
}

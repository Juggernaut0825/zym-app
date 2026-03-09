export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ImageContentPart {
  type: 'image_url';
  image_url: { url: string };
}

export interface VideoContentPart {
  type: 'video_url';
  video_url: { url: string };
}

export type ContentPart = TextContentPart | ImageContentPart | VideoContentPart;
export type MessageContent = string | ContentPart[];
export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type MediaKind = 'image' | 'video';
export type MediaStatus = 'ready' | 'expired' | 'error';

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: MessageContent;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  name: string;
  content: string;
  ok: boolean;
  errorCode?: string;
}

export interface ToolExecutionContext {
  workingDirectory: string;
  userId?: string;
  platform?: string;
  conversationHistory?: Message[];
  dataDirectory?: string;
  contextDirectory?: string;
  sessionFile?: string;
  mediaIndexFile?: string;
  activeMediaIds?: string[];
}

export interface Tool {
  definition: ToolDefinition;
  execute(args: any, context: ToolExecutionContext): Promise<string>;
}

export interface MediaRef {
  id: string;
  userId: string;
  platform: string;
  discordMessageId?: string;
  kind: MediaKind;
  mimeType: string;
  originalFilename: string;
  storedPath: string;
  createdAt: string;
  expiresAt: string;
  sizeBytes: number;
  sha256: string;
  status: MediaStatus;
  analysisIds: string[];
}

export interface MediaIndex {
  schemaVersion: number;
  items: MediaRef[];
}

export interface CompactMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  mediaIds?: string[];
  toolName?: string;
  createdAt: string;
}

export interface SessionState {
  schemaVersion: number;
  userId: string;
  rollingSummary: string;
  pinnedFacts: string[];
  recentMessages: CompactMessage[];
  activeMediaIds: string[];
  lastMessageAt?: string;
}

export interface MediaAnalysisEvidence {
  label: string;
  observation: string;
  confidence: ConfidenceLevel;
}

export interface MediaAnalysisDerivedScenario {
  label: string;
  totalWeightKg?: number | null;
  [key: string]: unknown;
}

export interface MediaAnalysis {
  id: string;
  mediaId: string;
  kind: string;
  domain: 'training' | 'food' | 'chart' | 'generic';
  question?: string;
  confidence: ConfidenceLevel;
  answerSummary: string;
  evidence: MediaAnalysisEvidence[];
  ambiguities: string[];
  derived?: {
    scenarios?: MediaAnalysisDerivedScenario[];
    [key: string]: unknown;
  };
  proposedTrainingEntry?: {
    name: string;
    sets: number;
    reps: string;
    weight_kg?: number | null;
  } | null;
  needsConfirmation: boolean;
  createdAt: string;
}

export interface SkillMeta {
  name: string;
  description: string;
  autoInvocable?: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface SkillActivationSignal {
  skillName: string;
  systemPrompt: string;
  toolPolicy?: {
    allowedTools?: string[];
    disallowedTools?: string[];
  };
  maxTurns?: number;
}

export interface DiscordConfig {
  appId: string;
  publicKey: string;
  botToken?: string;
  port?: number;
}

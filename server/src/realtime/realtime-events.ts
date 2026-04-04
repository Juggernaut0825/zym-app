export interface RealtimeCoachStatus {
  phase: string;
  label: string;
  active: boolean;
  tool?: string;
}

export type RealtimeEvent =
  | {
      type: 'message_created';
      topic: string;
      message: unknown;
      clientMessageId?: string | null;
    }
  | {
      type: 'typing';
      topic: string;
      userId: string;
      isTyping: boolean;
    }
  | {
      type: 'coach_status';
      topic: string;
      status: RealtimeCoachStatus;
    }
  | {
      type: 'inbox_updated';
      userIds: number[];
    }
  | {
      type: 'friends_updated';
      userIds: number[];
    };

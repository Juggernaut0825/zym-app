import { MessageService } from '../services/message-service.js';
import { CoachService } from '../services/coach-service.js';
import { logger } from '../utils/logger.js';
import { publishRealtimeEvent } from '../realtime/realtime-event-bus.js';
import {
  enqueueCoachReplyJob,
  shutdownCoachReplyQueue,
  startCoachReplyQueueWorker,
  type CoachReplyJobPayload,
} from './coach-reply-queue.js';

async function publishRealtimeEventSafely(
  event: Parameters<typeof publishRealtimeEvent>[0],
  label: string,
): Promise<void> {
  try {
    await publishRealtimeEvent(event);
  } catch (error) {
    logger.error(`[jobs] failed to publish realtime event (${label})`, error);
  }
}

async function publishCoachLifecycle(topic: string, active: boolean): Promise<void> {
  await publishRealtimeEventSafely({
    type: 'coach_status',
    topic,
    status: {
      phase: active ? 'composing' : 'complete',
      label: active ? 'Thinking...' : '',
      active,
    },
  }, active ? 'coach-status-start' : 'coach-status-complete');
  await publishRealtimeEventSafely({
    type: 'typing',
    topic,
    userId: 'coach',
    isTyping: active,
  }, active ? 'coach-typing-start' : 'coach-typing-stop');
}

export async function processCoachReplyJob(job: CoachReplyJobPayload): Promise<void> {
  const participantUserIds = Array.from(new Set(job.participantUserIds.filter((value) => Number.isInteger(value) && value > 0)));

  await publishCoachLifecycle(job.topic, true);
  try {
    const aiResponse = await CoachService.chat(String(job.userId), job.prompt, {
      mediaUrls: job.mediaUrls,
      mediaIds: job.mediaIds,
      platform: job.platform,
      coachOverride: job.coachOverride,
      conversationScope: job.conversationScope,
      allowWriteTools: job.allowWriteTools,
      onStatus: (status) => {
        void publishRealtimeEvent({
          type: 'coach_status',
          topic: job.topic,
          status: {
            phase: String(status.phase || 'composing'),
            label: String(status.label || ''),
            active: Boolean(status.active),
            tool: status.tool ? String(status.tool) : undefined,
          },
        }).catch((error) => {
          logger.error('[jobs] failed to publish coach status update', error);
        });
      },
    });

    await MessageService.sendMessage(0, job.topic, aiResponse, []);
    const [coachMessage] = await MessageService.getMessages(job.topic, 1);
    await publishRealtimeEventSafely({
      type: 'message_created',
      topic: job.topic,
      message: coachMessage || {
        id: `coach_${Date.now()}`,
        topic: job.topic,
        from_user_id: 0,
        content: aiResponse,
        media_urls: [],
        mentions: [],
        created_at: new Date().toISOString(),
      },
    }, 'coach-message-created');
    if (participantUserIds.length > 0) {
      await publishRealtimeEventSafely({
        type: 'inbox_updated',
        userIds: participantUserIds,
      }, 'coach-inbox-updated');
    }
  } catch (error) {
    logger.error(`[jobs] coach reply failed for ${job.topic}`, error);
  } finally {
    await publishCoachLifecycle(job.topic, false);
  }
}

export async function startCoachReplyWorker(): Promise<void> {
  await startCoachReplyQueueWorker(processCoachReplyJob);
}

export async function enqueueCoachReply(job: CoachReplyJobPayload): Promise<void> {
  await enqueueCoachReplyJob(job);
}

export async function shutdownCoachReplyWorker(): Promise<void> {
  await shutdownCoachReplyQueue();
}

export type { CoachReplyJobPayload };

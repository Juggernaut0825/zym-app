import { MessageService, encodeUtf8Base64 } from '../services/message-service.js';
import { CoachService } from '../services/coach-service.js';
import { ActivityNotificationService } from '../services/activity-notification-service.js';
import { PushNotificationService } from '../services/push-notification-service.js';
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

async function sendCoachFallbackMessage(job: CoachReplyJobPayload, participantUserIds: number[]): Promise<void> {
  const fallbackText = "I'm having trouble replying right now. Please try again in a moment.";
  const messageId = await MessageService.sendMessage(0, job.topic, fallbackText, []);
  const [fallbackMessage] = await MessageService.getMessages(job.topic, 1);

  await publishRealtimeEventSafely({
    type: 'message_created',
    topic: job.topic,
    message: fallbackMessage || {
      id: messageId,
      topic: job.topic,
      from_user_id: 0,
      content: fallbackText,
      content_b64: encodeUtf8Base64(fallbackText),
      media_urls: [],
      mentions: [],
      created_at: new Date().toISOString(),
    },
  }, 'coach-fallback-message-created');

  if (participantUserIds.length > 0) {
    await publishRealtimeEventSafely({
      type: 'inbox_updated',
      userIds: participantUserIds,
    }, 'coach-fallback-inbox-updated');
  }
}

export async function processCoachReplyJob(job: CoachReplyJobPayload): Promise<void> {
  const participantUserIds = Array.from(new Set([
    ...job.participantUserIds,
    job.userId,
  ].filter((value) => Number.isInteger(value) && value > 0)));

  await publishCoachLifecycle(job.topic, true);
  try {
    const aiResponse = await CoachService.chat(String(job.userId), job.prompt, {
      mediaUrls: job.mediaUrls,
      mediaIds: job.mediaIds,
      platform: job.platform,
      coachOverride: job.coachOverride,
      conversationKey: job.topic,
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

    const messageId = await MessageService.sendMessage(0, job.topic, aiResponse, []);

    let activityNotificationTargets: number[] = [];
    try {
      activityNotificationTargets = ActivityNotificationService.createMessageNotifications(
        0,
        job.topic,
        messageId,
        aiResponse,
        participantUserIds,
      );
    } catch (notificationError) {
      logger.error(`[jobs] failed to create coach activity notifications for ${job.topic}`, notificationError);
    }

    if (activityNotificationTargets.length > 0) {
      void PushNotificationService.sendMessageNotifications({
        actorUserId: 0,
        recipientUserIds: activityNotificationTargets,
        topic: job.topic,
        messageId,
        snippet: aiResponse,
      }).catch((error) => logger.warn('[jobs] failed to send coach push notification', error));
    }

    let coachMessage: Awaited<ReturnType<typeof MessageService.getMessages>>[number] | undefined;
    try {
      [coachMessage] = await MessageService.getMessages(job.topic, 1);
    } catch (messageLookupError) {
      logger.error(`[jobs] failed to load saved coach message for ${job.topic}`, messageLookupError);
    }

    await publishRealtimeEventSafely({
      type: 'message_created',
      topic: job.topic,
      message: coachMessage || {
        id: messageId,
        topic: job.topic,
        from_user_id: 0,
        content: aiResponse,
        content_b64: encodeUtf8Base64(aiResponse),
        media_urls: [],
        mentions: [],
        created_at: new Date().toISOString(),
      },
    }, 'coach-message-created');
    const inboxUserIds = Array.from(new Set([
      ...participantUserIds,
      ...activityNotificationTargets,
    ]));
    if (inboxUserIds.length > 0) {
      await publishRealtimeEventSafely({
        type: 'inbox_updated',
        userIds: inboxUserIds,
      }, 'coach-inbox-updated');
    }
  } catch (error) {
    logger.error(`[jobs] coach reply failed for ${job.topic}`, error);
    try {
      await sendCoachFallbackMessage(job, participantUserIds);
    } catch (fallbackError) {
      logger.error(`[jobs] failed to send coach fallback for ${job.topic}`, fallbackError);
    }
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

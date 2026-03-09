import { Message, ToolCall, ToolExecutionContext } from '../types/index.js';
import { AIService } from '../utils/ai-service.js';
import { ToolManager } from '../tools/tool-manager.js';
import { logger } from '../utils/logger.js';

const ZJ_SYSTEM_PROMPT = `You are ZJ, a fitness and lifestyle agent that works through controlled skill scripts.

## Language policy
- Always reply in English.

## Tool boundary
- You only have one tool: bash.
- You must call skill scripts through bash to read context, read user data, inspect media, and record training or meals.
- Do not assume Node has already loaded profile, history, media, or session details for you.
- Do not read random files directly; use dedicated scripts first.

## Preferred script protocol
- Need conversation context: run \`bash scripts/get-context.sh --scope recent\`
- Need profile: run \`bash scripts/get-profile.sh\`
- Need recent media: run \`bash scripts/list-recent-media.sh --active-only\`
- Need image/video/screenshot inspection: run \`bash scripts/inspect-media.sh --media-id ... --question "..." --domain training|food|chart|generic\`
- Need training/nutrition summary: run \`bash scripts/summary.sh\` or \`bash scripts/history.sh 7\`
- Need to update height/weight/profile: run \`bash scripts/set-profile.sh --height 175 --weight 70 --age 25 --gender male\` (or JSON input)
- Need to log training: run \`bash scripts/log-training.sh\`
- Need to log meals: run \`bash scripts/log-meal.sh\`

## Media rules
- If the user question depends on media content, inspect media first. Never guess.
- For high-risk visual details (weight, color, reps, labels, movement names), answers must be grounded in \`inspect-media.sh\` output.
- If the user provides text and media in one message, treat text as the question and media as evidence.
- If multiple media items exist, confirm the target first using \`get-context.sh\` and \`list-recent-media.sh\`.

## Logging rules
- Do not write media-derived training data into logs without user confirmation.
- If \`inspect-media.sh\` returns low confidence or multiple plausible scenarios, state uncertainty and ask the user to confirm.

## Response style
- Do required script calls first, then answer.
- Keep conclusions consistent with script outputs; do not invent facts.
- You may answer directly for pure small talk or obvious questions that do not require context lookup.`;

export interface RunnerCallbacks {
  onText?: (text: string) => void;
  onToolStart?: (name: string) => void;
  onToolEnd?: (name: string, result: string) => void;
}

export interface RunResult {
  response: string;
  messages: Message[];
}

export class ConversationRunner {
  private maxTurns = 50;
  private maxRepeatedToolFailures = 3;

  constructor(
    private aiService: AIService,
    private toolManager: ToolManager,
  ) {}

  async run(
    messages: Message[],
    callbacks?: RunnerCallbacks,
    context?: Partial<ToolExecutionContext>,
  ): Promise<RunResult> {
    // Ensure a system prompt exists
    if (!messages.find(m => m.role === 'system')) {
      messages.unshift({
        role: 'system',
        content: ZJ_SYSTEM_PROMPT,
      });
    }

    const tools = this.toolManager.getToolDefinitions();
    let turns = 0;
    const repeatedFailureByCall = new Map<string, number>();

    while (turns++ < this.maxTurns) {
      logger.info(`[Turn ${turns}] Running AI inference`);

      const response = await this.aiService.chatStream(messages, tools, {
        onText: callbacks?.onText,
      });

      if (response.usage) {
        logger.info(`[Turn ${turns}] Tokens: ${response.usage.promptTokens}+${response.usage.completionTokens}`);
      }

      // No tool calls, return final response
      if (!response.toolCalls || response.toolCalls.length === 0) {
        let finalContent = response.content || '';

        if (this.isBlank(finalContent)) {
          logger.warn(`[Turn ${turns}] AI returned empty content without tool calls, retrying plain-language response`);
          const retryResponse = await this.aiService.chatStream(
            [
              ...messages,
              {
                role: 'user',
                content: 'Please provide a direct natural-language reply to the user based on the context above. Do not call any tool and do not leave the response empty.',
              },
            ],
            [],
            {
              onText: callbacks?.onText,
            },
          );

          if (retryResponse.usage) {
            logger.info(`[Turn ${turns}] Empty-response retry tokens: ${retryResponse.usage.promptTokens}+${retryResponse.usage.completionTokens}`);
          }

          finalContent = retryResponse.content || '';
        }

        if (this.isBlank(finalContent)) {
          logger.warn(`[Turn ${turns}] Still empty after retry`);
          return {
            response: '',
            messages,
          };
        }

        if (this.containsCjk(finalContent)) {
          logger.warn(`[Turn ${turns}] Non-English content detected, rewriting response in English`);
          const rewriteResponse = await this.aiService.chatStream(
            [
              ...messages,
              {
                role: 'assistant',
                content: finalContent,
              },
              {
                role: 'user',
                content: 'Rewrite the previous assistant message into clear natural English only. Keep the original meaning and do not call tools.',
              },
            ],
            [],
            {
              onText: callbacks?.onText,
            },
          );
          if (!this.isBlank(rewriteResponse.content)) {
            finalContent = rewriteResponse.content;
          }
        }

        messages.push({
          role: 'assistant',
          content: finalContent,
        });

        return {
          response: finalContent,
          messages,
        };
      }

      // Tool call path
      logger.info(`[Turn ${turns}] Tool calls: ${response.toolCalls.map(tc => tc.function.name).join(', ')}`);

      // Append assistant message
      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls,
      });

      // Execute each tool call
      for (const toolCall of response.toolCalls) {
        callbacks?.onToolStart?.(toolCall.function.name);
        logger.info(`[Turn ${turns}] Executing: ${toolCall.function.name}`);

        const result = await this.toolManager.executeTool(toolCall, {
          ...context,
          conversationHistory: messages,
        });

        logger.info(`[Turn ${turns}] Completed: ${toolCall.function.name} (${result.content.length} chars)`);
        const compactToolResult = result.content.replace(/\s+/g, ' ').slice(0, 240);
        logger.info(`[Turn ${turns}] Tool output summary: ${compactToolResult}`);

        messages.push({
          role: 'tool',
          tool_call_id: result.tool_call_id,
          name: result.name,
          content: result.content,
        });

        callbacks?.onToolEnd?.(toolCall.function.name, result.content);

        const callSignature = this.getToolCallSignature(toolCall);
        if (this.looksLikeToolFailure(result.content)) {
          const failedCount = (repeatedFailureByCall.get(callSignature) || 0) + 1;
          repeatedFailureByCall.set(callSignature, failedCount);
          logger.warn(`[Turn ${turns}] Repeated tool failures ${failedCount}/${this.maxRepeatedToolFailures}: ${callSignature}`);

          if (failedCount >= this.maxRepeatedToolFailures) {
            const fallback = 'I hit repeated failures while running logging tools, so I stopped retrying that same call. Please provide a clearer input and I will continue.';
            messages.push({
              role: 'assistant',
              content: fallback,
            });
            return {
              response: fallback,
              messages,
            };
          }
        } else {
          repeatedFailureByCall.delete(callSignature);
        }
      }
    }

    return {
      response: '[Max turns reached. Please continue the conversation.]',
      messages,
    };
  }

  private isBlank(content: string | undefined): boolean {
    return !content || content.trim().length === 0;
  }

  private containsCjk(content: string | undefined): boolean {
    if (!content) return false;
    return /[\u4E00-\u9FFF]/.test(content);
  }

  private looksLikeToolFailure(content: string): boolean {
    const text = String(content || '').trim().toLowerCase();
    if (!text) return false;
    return text.startsWith('command execution failed')
      || text.startsWith('tool argument parse error')
      || text.startsWith('error:')
      || text.includes('\nerror:')
      || text.includes('error:')
      || text.includes('traceback');
  }

  private getToolCallSignature(toolCall: ToolCall): string {
    return `${toolCall.function.name}:${toolCall.function.arguments}`;
  }
}

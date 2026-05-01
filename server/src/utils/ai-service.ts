import axios from 'axios';
import { Message, MessageContent, ToolDefinition, ToolCall } from '../types/index.js';
import { logger } from './logger.js';
import { OpenRouterUsageContext, OpenRouterUsageService } from '../services/openrouter-usage-service.js';

export interface StreamCallbacks {
  onText?: (text: string) => void;
}

export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

const OPENROUTER_ERROR_DETAIL_MAX = 800;
const DEFAULT_OPENROUTER_MAX_TOKENS = 2048;

function resolveOpenRouterMaxTokens(): number {
  const parsed = Number(process.env.OPENROUTER_MAX_TOKENS || DEFAULT_OPENROUTER_MAX_TOKENS);
  if (!Number.isFinite(parsed)) return DEFAULT_OPENROUTER_MAX_TOKENS;
  return Math.min(4096, Math.max(256, Math.floor(parsed)));
}

function summarizeOpenRouterError(error: unknown): {
  status: number | null;
  detail: string;
  wrappedError: Error;
} {
  if (!axios.isAxiosError(error)) {
    const fallback = error instanceof Error ? error : new Error(String(error || 'OpenRouter request failed'));
    return {
      status: null,
      detail: fallback.message,
      wrappedError: fallback,
    };
  }

  const status = Number.isInteger(Number(error.response?.status)) ? Number(error.response?.status) : null;
  const responseData = error.response?.data;
  let detail = '';

  if (typeof responseData === 'string') {
    detail = responseData;
  } else if (responseData && typeof responseData === 'object') {
    try {
      detail = JSON.stringify(responseData);
    } catch {
      detail = '';
    }
  }

  if (!detail) {
    detail = error.message || 'OpenRouter request failed';
  }

  const normalizedDetail = detail.replace(/\s+/g, ' ').trim().slice(0, OPENROUTER_ERROR_DETAIL_MAX);
  const message = status
    ? `OpenRouter request failed (${status}): ${normalizedDetail || 'No response detail'}`
    : `OpenRouter request failed: ${normalizedDetail || 'No response detail'}`;

  return {
    status,
    detail: normalizedDetail,
    wrappedError: new Error(message),
  };
}

/**
 * AI service via OpenRouter (Gemini 3 Flash by default).
 */
export class AIService {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private maxTokens: number;
  private usageContext: OpenRouterUsageContext;

  constructor(options: { usageContext?: OpenRouterUsageContext } = {}) {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('Please set the OPENROUTER_API_KEY environment variable.');
    }

    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.model = process.env.GAUZ_LLM_MODEL || 'google/gemini-3-flash-preview';
    this.maxTokens = resolveOpenRouterMaxTokens();
    this.usageContext = options.usageContext || {
      source: 'ai_service_chat',
      requestKind: 'chat',
      model: this.model,
    };
  }

  async chat(messages: Message[], tools: ToolDefinition[]): Promise<AIResponse> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');
    const startedAt = Date.now();

    try {
      const response = await axios.post(this.baseUrl, {
        model: this.model,
        messages: this.convertMessages(otherMessages, systemMessage?.content as string | undefined),
        tools: tools.length > 0 ? tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })) : undefined,
        max_tokens: this.maxTokens,
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/Juggernaut0825/zym',
          'X-Title': 'ZJ Agent',
        },
      });

      OpenRouterUsageService.recordSuccessFromPayload(response.data, this.usageContext, startedAt);
      return this.parseResponse(response.data);
    } catch (error) {
      const summarized = summarizeOpenRouterError(error);
      logger.error(
        `[ai] chat request failed model=${this.model} tools=${tools.length} status=${summarized.status ?? 'unknown'} detail=${summarized.detail || 'n/a'}`,
      );
      OpenRouterUsageService.recordFailure(summarized.wrappedError, this.usageContext, startedAt);
      throw summarized.wrappedError;
    }
  }

  async chatStream(
    messages: Message[],
    tools: ToolDefinition[],
    callbacks?: StreamCallbacks,
  ): Promise<AIResponse> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');
    const startedAt = Date.now();

    // OpenRouter supports streaming, but this implementation uses non-stream mode.
    // For true streaming behavior, use fetch + ReadableStream.
    try {
      const response = await axios.post(this.baseUrl, {
        model: this.model,
        messages: this.convertMessages(otherMessages, systemMessage?.content as string | undefined),
        tools: tools.length > 0 ? tools.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })) : undefined,
        max_tokens: this.maxTokens,
        stream: false,
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/Juggernaut0825/zym',
          'X-Title': 'ZJ Agent',
        },
      });

      OpenRouterUsageService.recordSuccessFromPayload(response.data, this.usageContext, startedAt);
      const result = this.parseResponse(response.data);

      // Simulated streaming callback
      if (callbacks?.onText && result.content) {
        callbacks.onText(result.content);
      }

      return result;
    } catch (error) {
      const summarized = summarizeOpenRouterError(error);
      logger.error(
        `[ai] chatStream request failed model=${this.model} tools=${tools.length} status=${summarized.status ?? 'unknown'} detail=${summarized.detail || 'n/a'}`,
      );
      OpenRouterUsageService.recordFailure(summarized.wrappedError, this.usageContext, startedAt);
      throw summarized.wrappedError;
    }
  }

  private convertMessages(messages: Message[], systemPrompt?: string): any[] {
    const result: any[] = [];

    // OpenRouter expects system prompts in the "system" role.
    if (systemPrompt) {
      result.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      if (msg.role === 'tool') {
        // Native tool-result message format
        result.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id,
          content: msg.content || '',
        });
      } else if (msg.role === 'assistant' && msg.tool_calls) {
        // Native assistant + tool_calls message format
        result.push({
          role: 'assistant',
          content: msg.content || '',
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        });
      } else {
        result.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: this.convertContent(msg.content),
        });
      }
    }

    return result;
  }

  /** Convert MessageContent into OpenRouter API format. */
  private convertContent(content: MessageContent | undefined): string | any[] {
    if (!content) return '';
    if (typeof content === 'string') return content;

    return content.map(part => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      } else if (part.type === 'image_url') {
        return { type: 'image_url', image_url: { url: part.image_url.url } };
      } else if (part.type === 'video_url') {
        return { type: 'video_url', video_url: { url: part.video_url.url } };
      }
      return { type: 'text', text: '' };
    });
  }

  private parseResponse(data: any): AIResponse {
    const choice = data.choices?.[0];
    if (!choice) {
      logger.warn(`API returned no choices (keys: ${Object.keys(data || {}).join(', ') || 'none'})`);
      return { content: '' };
    }

    const message = choice.message;
    const content = this.normalizeTextContent(message?.content);
    const toolCalls: ToolCall[] = [];

    if (!content && !message?.tool_calls) {
      logger.warn(`API returned an empty message (finish_reason=${choice.finish_reason || 'unknown'})`);
    }

    // Parse tool calls if present
    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        if (tc.type === 'function') {
          toolCalls.push({
            id: tc.id || `tc_${Date.now()}`,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: typeof tc.function.arguments === 'string'
                ? tc.function.arguments
                : JSON.stringify(tc.function.arguments),
            },
          });
        }
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      } : undefined,
    };
  }

  private normalizeTextContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map(part => {
          if (typeof part === 'string') {
            return part;
          }

          if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
            return part.text;
          }

          return '';
        })
        .join('');
    }

    return '';
  }
}

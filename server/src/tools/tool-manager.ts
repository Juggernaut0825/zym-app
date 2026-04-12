import { Tool, ToolDefinition, ToolCall, ToolResult, ToolExecutionContext } from '../types/index.js';
import { SecurityEventService } from '../services/security-event-service.js';
import { createDefaultTypedTools } from './tool-registry.js';

const MAX_TOOL_OUTPUT_CHARS = 12_000;
const WRITE_TOOL_NAMES = new Set(['set_profile', 'log_check_in', 'log_meal', 'log_training']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesPrimitiveType(value: unknown, expected: string): boolean {
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') return isObject(value);
  if (expected === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (expected === 'integer') return typeof value === 'number' && Number.isInteger(value);
  return typeof value === expected;
}

function validateStringRule(value: string, rule: any, key: string): string | null {
  if (typeof rule?.minLength === 'number' && value.length < rule.minLength) {
    return `Invalid "${key}" length; minimum is ${rule.minLength}`;
  }
  if (typeof rule?.maxLength === 'number' && value.length > rule.maxLength) {
    return `Invalid "${key}" length; maximum is ${rule.maxLength}`;
  }
  if (typeof rule?.pattern === 'string' && rule.pattern.trim()) {
    try {
      const regex = new RegExp(rule.pattern);
      if (!regex.test(value)) {
        return `Invalid "${key}" format`;
      }
    } catch {
      // Ignore invalid regex config; execution safety is still enforced by tool itself.
    }
  }
  return null;
}

function validateNumberRule(value: number, rule: any, key: string): string | null {
  if (typeof rule?.minimum === 'number' && value < rule.minimum) {
    return `Invalid "${key}" value; minimum is ${rule.minimum}`;
  }
  if (typeof rule?.maximum === 'number' && value > rule.maximum) {
    return `Invalid "${key}" value; maximum is ${rule.maximum}`;
  }
  return null;
}

function validateArrayRule(value: unknown[], rule: any, key: string): string | null {
  if (typeof rule?.maxItems === 'number' && value.length > rule.maxItems) {
    return `Invalid "${key}" length; maximum is ${rule.maxItems}`;
  }

  if (typeof rule?.itemType === 'string') {
    for (const item of value) {
      if (!matchesPrimitiveType(item, rule.itemType)) {
        return `Invalid "${key}" item type; expected ${rule.itemType}`;
      }
    }
  }

  if (Array.isArray(rule?.itemEnum)) {
    for (const item of value) {
      if (!rule.itemEnum.includes(item as never)) {
        return `Invalid "${key}" value`;
      }
    }
  }

  return null;
}

function validateArgsAgainstSchema(definition: ToolDefinition, args: unknown): string | null {
  const schema = definition.parameters;
  if (!isObject(args)) {
    return 'Arguments must be a JSON object.';
  }

  const props = schema?.properties || {};
  const required = Array.isArray(schema?.required) ? schema.required : [];

  for (const field of required) {
    if (!(field in args) || args[field] === undefined || args[field] === null) {
      return `Missing required field: ${field}`;
    }
  }

  // Strict boundary: reject undeclared fields to prevent prompt-injection side channels.
  for (const key of Object.keys(args)) {
    const rule = props[key];
    if (!rule) {
      return `Unknown field: ${key}`;
    }

    const value = args[key];
    if (value === undefined || value === null) {
      continue;
    }

    const allowsSingletonStringForArray = rule.type === 'array'
      && typeof value === 'string'
      && rule.itemType === 'string';

    if (typeof rule.type === 'string' && !matchesPrimitiveType(value, rule.type)) {
      if (allowsSingletonStringForArray) {
        if (Array.isArray(rule.itemEnum) && !rule.itemEnum.includes(value as never)) {
          return `Invalid "${key}" value`;
        }
        continue;
      }
      return `Invalid "${key}" type; expected ${rule.type}`;
    }

    if (Array.isArray(rule.enum) && !rule.enum.includes(value as never)) {
      return `Invalid "${key}" value`;
    }

    if (rule.type === 'string' && typeof value === 'string') {
      const error = validateStringRule(value, rule, key);
      if (error) return error;
    }

    if ((rule.type === 'number' || rule.type === 'integer') && typeof value === 'number') {
      const error = validateNumberRule(value, rule, key);
      if (error) return error;
    }

    if (rule.type === 'array' && Array.isArray(value)) {
      const error = validateArrayRule(value, rule, key);
      if (error) return error;
    }
  }

  return null;
}

function sanitizeToolOutput(output: unknown): string {
  const text = String(output ?? '');
  const normalized = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim();
  if (normalized.length <= MAX_TOOL_OUTPUT_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n\n[output truncated for safety]`;
}

function normalizeUserId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function trackToolSecurityEvent(
  userId: number | null,
  eventType: string,
  severity: 'info' | 'warn' | 'high',
  metadata: Record<string, unknown>,
): void {
  if (!userId) return;
  try {
    SecurityEventService.create({
      userId,
      eventType,
      severity,
      metadata,
    });
  } catch {
    // Security telemetry should not break agent runtime.
  }
}

function validateToolPolicy(
  toolName: string,
  _args: unknown,
  context: ToolExecutionContext,
): string | null {
  if (context.allowWriteTools !== false) {
    return null;
  }

  if (WRITE_TOOL_NAMES.has(toolName)) {
    return `Write tool is not allowed in this conversation scope: ${toolName}`;
  }

  return null;
}

export class ToolManager {
  private tools: Map<string, Tool> = new Map();
  private workingDirectory: string;
  private allowedTools: Set<string> | null;
  private disallowedTools: Set<string>;

  constructor(
    workingDirectory: string = process.cwd(),
    toolPolicy: { allowedTools?: string[]; disallowedTools?: string[] } = {},
  ) {
    this.workingDirectory = workingDirectory;
    this.allowedTools = Array.isArray(toolPolicy.allowedTools) && toolPolicy.allowedTools.length > 0
      ? new Set(toolPolicy.allowedTools.map((item) => String(item || '').trim()).filter(Boolean))
      : null;
    this.disallowedTools = new Set(
      Array.isArray(toolPolicy.disallowedTools)
        ? toolPolicy.disallowedTools.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
    );
    this.registerDefaultTools();
  }

  private registerDefaultTools(): void {
    for (const tool of createDefaultTypedTools()) {
      this.registerTool(tool);
    }
  }

  private isToolAllowed(toolName: string): boolean {
    if (this.disallowedTools.has(toolName)) {
      return false;
    }
    if (this.allowedTools && !this.allowedTools.has(toolName)) {
      return false;
    }
    return true;
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((tool) => this.isToolAllowed(tool.definition.name))
      .map(tool => tool.definition);
  }

  async executeTool(
    toolCall: ToolCall,
    contextOverrides?: Partial<ToolExecutionContext>,
  ): Promise<ToolResult> {
    const toolName = toolCall.function.name;
    const tool = this.tools.get(toolName);

    if (!tool) {
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolName,
        content: `Error: tool "${toolName}" was not found.`,
        ok: false,
        errorCode: 'TOOL_NOT_FOUND',
      };
    }

    if (!this.isToolAllowed(toolName)) {
      const numericUserId = normalizeUserId(contextOverrides?.userId);
      trackToolSecurityEvent(numericUserId, 'coach_tool_policy_rejected', 'warn', {
        tool: toolName,
        reason: 'tool_not_allowed_for_skill',
      });
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolName,
        content: `Tool policy error: tool "${toolName}" is not available in the active skill.`,
        ok: false,
        errorCode: 'TOOL_POLICY_DENIED',
      };
    }

    try {
      const rawArguments = String(toolCall.function.arguments || '');
      const numericUserId = normalizeUserId(contextOverrides?.userId);
      if (rawArguments.length > 20_000) {
        trackToolSecurityEvent(numericUserId, 'coach_tool_argument_rejected', 'warn', {
          tool: toolCall.function.name,
          reason: 'payload_too_large',
          size: rawArguments.length,
        });
        return {
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function.name,
          content: 'Tool argument parse error: argument payload too large',
          ok: false,
          errorCode: 'INVALID_TOOL_ARGUMENTS',
        };
      }

      const context: ToolExecutionContext = {
        workingDirectory: this.workingDirectory,
        conversationHistory: contextOverrides?.conversationHistory || [],
        ...contextOverrides,
      };

      let args: unknown;
      try {
        args = JSON.parse(rawArguments);
      } catch (error: any) {
        trackToolSecurityEvent(numericUserId, 'coach_tool_argument_rejected', 'warn', {
          tool: toolCall.function.name,
          reason: 'json_parse_error',
        });
        return {
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function.name,
          content: `Tool argument parse error: ${error.message}`,
          ok: false,
          errorCode: 'INVALID_TOOL_ARGUMENTS',
        };
      }

      const schemaError = validateArgsAgainstSchema(tool.definition, args);
      if (schemaError) {
        trackToolSecurityEvent(numericUserId, 'coach_tool_argument_rejected', 'warn', {
          tool: toolCall.function.name,
          reason: 'schema_validation_failed',
          details: String(schemaError).slice(0, 220),
        });
        return {
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function.name,
          content: `Tool argument parse error: ${schemaError}`,
          ok: false,
          errorCode: 'INVALID_TOOL_ARGUMENTS',
        };
      }

      const policyError = validateToolPolicy(toolName, args, context);
      if (policyError) {
        trackToolSecurityEvent(numericUserId, 'coach_tool_policy_rejected', 'warn', {
          tool: toolCall.function.name,
          scope: context.conversationScope || 'unknown',
          allowWriteTools: context.allowWriteTools !== false,
          details: policyError,
        });
        return {
          tool_call_id: toolCall.id,
          role: 'tool',
          name: toolCall.function.name,
          content: `Tool policy error: ${policyError}`,
          ok: false,
          errorCode: 'TOOL_POLICY_DENIED',
        };
      }

      const output = await tool.execute(args, context);
      const safeOutput = sanitizeToolOutput(output);

      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolCall.function.name,
        content: safeOutput,
        ok: true,
      };
    } catch (error: any) {
      const numericUserId = normalizeUserId(contextOverrides?.userId);
      trackToolSecurityEvent(numericUserId, 'coach_tool_execution_error', 'warn', {
        tool: toolCall.function.name,
        error: String(error?.message || 'unknown').slice(0, 300),
      });
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        name: toolCall.function.name,
        content: `Tool execution error: ${error.message}`,
        ok: false,
        errorCode: 'TOOL_EXECUTION_ERROR',
      };
    }
  }

  getToolCount(): number {
    return this.getToolDefinitions().length;
  }
}

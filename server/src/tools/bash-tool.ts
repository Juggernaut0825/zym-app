import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolDefinition, ToolExecutionContext } from '../types/index.js';
import { resolveSkillRoot } from '../utils/path-resolver.js';

const execFileAsync = promisify(execFile);
const ALLOWED_SCRIPTS = new Set([
  'get-context.sh',
  'get-profile.sh',
  'set-profile.sh',
  'get-daily-intake.sh',
  'get-daily-training.sh',
  'summary.sh',
  'history.sh',
  'list-recent-media.sh',
  'inspect-media.sh',
  'analyze-form.sh',
  'analyze-food.sh',
  'log-training.sh',
  'log-meal.sh',
  'cleanup-media.sh',
  'get-plan.sh',
  'generate-plan.sh',
  'set-goal.sh',
]);

type ScriptArgValidator = (args: string[]) => string | null;

const FLAG_TOKEN_RE = /^--[a-z0-9][a-z0-9_-]*$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MEDIA_ID_RE = /^med_[a-zA-Z0-9._-]{4,120}$/;
const PROFILE_FLAG_KEY_TO_KIND: Record<string, 'number' | 'enum' | 'string' | 'csv'> = {
  '--height': 'number',
  '--height-cm': 'number',
  '--height_cm': 'number',
  '--weight': 'number',
  '--weight-kg': 'number',
  '--weight_kg': 'number',
  '--age': 'number',
  '--gender': 'enum',
  '--body-fat': 'number',
  '--body-fat-pct': 'number',
  '--body_fat_pct': 'number',
  '--activity': 'enum',
  '--activity-level': 'enum',
  '--activity_level': 'enum',
  '--goal': 'enum',
  '--experience': 'enum',
  '--experience-level': 'enum',
  '--experience_level': 'enum',
  '--training-days': 'number',
  '--training_days': 'number',
  '--notes': 'string',
  '--preferences': 'csv',
};

function isIntegerText(value: string): boolean {
  return /^-?\d+$/.test(String(value || '').trim());
}

function inIntRange(value: string, min: number, max: number): boolean {
  if (!isIntegerText(value)) return false;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
}

function isSafeTextArg(value: string, maxLength = 500): boolean {
  const normalized = String(value || '');
  return normalized.length > 0
    && normalized.length <= maxLength
    && !/[\u0000-\u001F\u007F]/.test(normalized);
}

function isPathLikeArg(value: string): boolean {
  const text = String(value || '').trim();
  if (!text || text.length > 1024) return false;
  if (/[\u0000-\u001F\u007F]/.test(text)) return false;
  if (text.includes('..')) return false;
  return /^[a-zA-Z0-9_./:@%+\-=()]+$/.test(text);
}

function validateNoArgs(script: string, args: string[]): string | null {
  if (args.length !== 0) return `${script} does not accept arguments`;
  return null;
}

function validateOptionalDate(script: string, args: string[]): string | null {
  if (args.length === 0) return null;
  if (args.length !== 1) return `${script} accepts at most one date argument`;
  if (!DATE_RE.test(args[0])) return `${script} date must be YYYY-MM-DD`;
  return null;
}

function validateHistoryArgs(args: string[]): string | null {
  if (args.length === 0) return null;
  if (args.length !== 1) return 'history.sh accepts at most one argument';
  if (!inIntRange(args[0], 1, 365)) return 'history.sh days must be integer between 1 and 365';
  return null;
}

function validateSummaryArgs(args: string[]): string | null {
  if (args.length === 0) return null;
  if (args.length !== 1) return 'summary.sh accepts at most one argument';
  if (args[0] !== 'today' && args[0] !== 'week') return 'summary.sh argument must be today or week';
  return null;
}

function validateSetGoalArgs(args: string[]): string | null {
  if (args.length !== 1) return 'set-goal.sh requires one argument';
  if (!['cut', 'bulk', 'maintain'].includes(args[0])) return 'set-goal.sh goal must be cut|bulk|maintain';
  return null;
}

function validateSingleTextArg(script: string, args: string[], maxLength: number): string | null {
  if (args.length !== 1) return `${script} requires exactly one argument`;
  if (!isSafeTextArg(args[0], maxLength)) return `${script} argument is invalid or too long`;
  return null;
}

function validatePathArg(script: string, args: string[]): string | null {
  if (args.length !== 1) return `${script} requires exactly one file path argument`;
  if (!isPathLikeArg(args[0])) return `${script} path argument is invalid`;
  return null;
}

function validateAnalyzeFormArgs(args: string[]): string | null {
  if (args.length === 0) return 'analyze-form.sh requires arguments';
  if (args[0] === '--media-id') {
    if (args.length !== 2 && args.length !== 4) return 'analyze-form.sh --media-id usage: --media-id <med_id> [--question <text>]';
    if (!MEDIA_ID_RE.test(args[1])) return 'analyze-form.sh media id is invalid';
    if (args.length === 4) {
      if (args[2] !== '--question') return 'analyze-form.sh only --question is allowed after --media-id';
      if (!isSafeTextArg(args[3], 500)) return 'analyze-form.sh question is invalid';
    }
    return null;
  }
  return validatePathArg('analyze-form.sh', args);
}

function validateGetContextArgs(args: string[]): string | null {
  let i = 0;
  while (i < args.length) {
    const token = args[i];
    if (token === '--json') {
      i += 1;
      continue;
    }
    if (token === '--scope') {
      if (!args[i + 1]) return 'get-context.sh missing value for --scope';
      if (!['summary', 'recent', 'full'].includes(args[i + 1])) return 'get-context.sh scope must be summary|recent|full';
      i += 2;
      continue;
    }
    if (token === '--limit') {
      if (!args[i + 1]) return 'get-context.sh missing value for --limit';
      if (!inIntRange(args[i + 1], 1, 50)) return 'get-context.sh limit must be integer between 1 and 50';
      i += 2;
      continue;
    }
    return `get-context.sh does not allow token: ${token}`;
  }
  return null;
}

function validateListRecentMediaArgs(args: string[]): string | null {
  let i = 0;
  while (i < args.length) {
    const token = args[i];
    if (token === '--json' || token === '--active-only') {
      i += 1;
      continue;
    }
    if (token === '--limit') {
      if (!args[i + 1]) return 'list-recent-media.sh missing value for --limit';
      if (!inIntRange(args[i + 1], 1, 20)) return 'list-recent-media.sh limit must be integer between 1 and 20';
      i += 2;
      continue;
    }
    return `list-recent-media.sh does not allow token: ${token}`;
  }
  return null;
}

function validateInspectMediaArgs(args: string[]): string | null {
  let i = 0;
  let mediaId = '';
  while (i < args.length) {
    const token = args[i];
    if (!FLAG_TOKEN_RE.test(token)) return `inspect-media.sh invalid token: ${token}`;
    if (token === '--media-id') {
      if (!args[i + 1]) return 'inspect-media.sh missing value for --media-id';
      mediaId = args[i + 1];
      if (!MEDIA_ID_RE.test(mediaId)) return 'inspect-media.sh media id is invalid';
      i += 2;
      continue;
    }
    if (token === '--question') {
      if (!args[i + 1]) return 'inspect-media.sh missing value for --question';
      if (!isSafeTextArg(args[i + 1], 500)) return 'inspect-media.sh question is invalid';
      i += 2;
      continue;
    }
    if (token === '--domain') {
      if (!args[i + 1]) return 'inspect-media.sh missing value for --domain';
      if (!['training', 'food', 'chart', 'generic'].includes(args[i + 1])) return 'inspect-media.sh domain is invalid';
      i += 2;
      continue;
    }
    return `inspect-media.sh does not allow token: ${token}`;
  }

  if (!mediaId) return 'inspect-media.sh requires --media-id';
  return null;
}

function validateCleanupMediaArgs(args: string[]): string | null {
  let i = 0;
  while (i < args.length) {
    const token = args[i];
    if (token === '--dry-run') {
      i += 1;
      continue;
    }
    if (token === '--days') {
      if (!args[i + 1]) return 'cleanup-media.sh missing value for --days';
      if (!inIntRange(args[i + 1], 1, 90)) return 'cleanup-media.sh days must be integer between 1 and 90';
      i += 2;
      continue;
    }
    return `cleanup-media.sh does not allow token: ${token}`;
  }
  return null;
}

function validateSetProfileArgs(args: string[]): string | null {
  if (args.length === 0) return 'set-profile.sh requires arguments';
  if (args.length === 1) {
    const single = args[0];
    if (!isSafeTextArg(single, 6_000)) return 'set-profile.sh JSON argument is invalid or too long';
    if (!(single.trim().startsWith('{') && single.trim().endsWith('}'))) {
      return 'set-profile.sh single argument must be a JSON object string';
    }
    return null;
  }

  if (args.length % 2 !== 0) return 'set-profile.sh flag mode requires key/value pairs';
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    const kind = PROFILE_FLAG_KEY_TO_KIND[key];
    if (!kind) return `set-profile.sh unsupported flag: ${key}`;
    if (!isSafeTextArg(value, 400)) return `set-profile.sh invalid value for ${key}`;
    if (kind === 'number' && !/^-?\d+(?:\.\d+)?$/.test(value)) {
      return `set-profile.sh value for ${key} must be numeric`;
    }
    if (kind === 'enum') {
      const normalized = value.toLowerCase();
      const allowedByKey: Record<string, string[]> = {
        '--gender': ['male', 'female'],
        '--activity': ['sedentary', 'light', 'moderate', 'active', 'very_active'],
        '--activity-level': ['sedentary', 'light', 'moderate', 'active', 'very_active'],
        '--activity_level': ['sedentary', 'light', 'moderate', 'active', 'very_active'],
        '--goal': ['cut', 'bulk', 'maintain'],
        '--experience': ['beginner', 'intermediate', 'advanced'],
        '--experience-level': ['beginner', 'intermediate', 'advanced'],
        '--experience_level': ['beginner', 'intermediate', 'advanced'],
      };
      const allowed = allowedByKey[key] || [];
      if (!allowed.includes(normalized)) {
        return `set-profile.sh invalid enum value for ${key}`;
      }
    }
    if (kind === 'csv' && value.split(',').length > 30) {
      return `set-profile.sh value for ${key} has too many items`;
    }
  }
  return null;
}

const SCRIPT_ARG_VALIDATORS: Record<string, ScriptArgValidator> = {
  'get-profile.sh': (args) => validateNoArgs('get-profile.sh', args),
  'get-plan.sh': (args) => validateNoArgs('get-plan.sh', args),
  'generate-plan.sh': (args) => validateNoArgs('generate-plan.sh', args),
  'get-context.sh': validateGetContextArgs,
  'list-recent-media.sh': validateListRecentMediaArgs,
  'inspect-media.sh': validateInspectMediaArgs,
  'analyze-form.sh': validateAnalyzeFormArgs,
  'analyze-food.sh': (args) => validatePathArg('analyze-food.sh', args),
  'log-meal.sh': (args) => validateSingleTextArg('log-meal.sh', args, 500),
  'log-training.sh': (args) => {
    const baseError = validateSingleTextArg('log-training.sh', args, 6_000);
    if (baseError) return baseError;
    const payload = args[0].trim();
    if (!(payload.startsWith('[') || payload.startsWith('{'))) {
      return 'log-training.sh payload must be JSON';
    }
    return null;
  },
  'set-goal.sh': validateSetGoalArgs,
  'summary.sh': validateSummaryArgs,
  'history.sh': validateHistoryArgs,
  'set-profile.sh': validateSetProfileArgs,
  'get-daily-intake.sh': (args) => validateOptionalDate('get-daily-intake.sh', args),
  'get-daily-training.sh': (args) => validateOptionalDate('get-daily-training.sh', args),
  'cleanup-media.sh': validateCleanupMediaArgs,
};

function splitCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;
  let escaped = false;

  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && quote !== '\'') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaped || quote) {
    throw new Error('Command contains an unclosed quote or escape sequence.');
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function resolveAllowedScript(scriptToken: string): string {
  const scriptName = path.basename(scriptToken);
  if (!ALLOWED_SCRIPTS.has(scriptName)) {
    throw new Error(`Only approved skill scripts are allowed; script is not in whitelist: ${scriptName}`);
  }

  const scriptsDir = path.join(resolveSkillRoot(), 'scripts');
  const realScriptsDir = fs.realpathSync(scriptsDir);
  const resolvedPath = path.join(scriptsDir, scriptName);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Script does not exist: ${scriptName}`);
  }

  const realScriptPath = fs.realpathSync(resolvedPath);
  if (!realScriptPath.startsWith(`${realScriptsDir}${path.sep}`)) {
    throw new Error('Script path escapes allowed directory; execution blocked.');
  }

  return realScriptPath;
}

function validateScriptArgs(scriptPath: string, scriptArgs: string[]): void {
  const scriptName = path.basename(scriptPath);
  const validator = SCRIPT_ARG_VALIDATORS[scriptName];
  if (!validator) {
    throw new Error(`No argument validator configured for script: ${scriptName}`);
  }
  const error = validator(scriptArgs);
  if (error) {
    throw new Error(error);
  }
}

/**
 * Bash tool for executing controlled shell commands.
 * This is the only core tool for ZJ Agent.
 */
export class BashTool implements Tool {
  definition: ToolDefinition = {
    name: 'bash',
    description: `Execute controlled skill scripts. Only commands in this format are allowed:
  bash scripts/<script>.sh [args...]

Do not directly run cat/find/jq/python -c or any non-whitelisted script. Prefer dedicated scripts over direct file reads.

Available skill scripts (in skill-z/skills/z/scripts/):

Profile management:
- set-profile.sh: Set user profile fields (supports JSON or params like --height 175 --weight 70 --age 25 --gender male)
- get-profile.sh: Read current user profile
- get-context.sh [--scope recent|summary|full] [--limit N] [--json]: Read current conversation context, summary, and active media refs

Nutrition tracking:
- analyze-food.sh <image_path>: Analyze food image, estimate calories and macros
- log-meal.sh "<description>": Log meal from text description
- get-daily-intake.sh [date]: Get intake summary for a day

Training tracking:
- analyze-form.sh <video_path>: Analyze workout video and evaluate movement quality
- log-training.sh '<json>': Log training data
- get-daily-training.sh [date]: Get daily training records
- inspect-media.sh --media-id <id> --question "<question>" --domain training|food|chart|generic: Structured analysis based on stored media
- list-recent-media.sh [--limit 5] [--active-only] [--json]: List recent media IDs
- cleanup-media.sh [--days 7]: Clean up expired media and analysis artifacts

Goals and plans:
- set-goal.sh <cut|bulk|maintain>: Set fitness goal
- get-plan.sh: Get current training plan
- summary.sh: Get today/week summary

History:
- history.sh [days]: View historical records

Examples:
  bash { command: "bash scripts/get-context.sh --scope recent" }
  bash { command: "bash scripts/get-profile.sh" }
  bash { command: "bash scripts/list-recent-media.sh --active-only" }
  bash { command: "bash scripts/inspect-media.sh --media-id med_xxx --question \\"How much weight is on this clean pull?\\" --domain training" }`,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Script command to execute. Must be bash scripts/<script>.sh ...',
          minLength: 20,
          maxLength: 600,
          pattern: '^bash\\s+scripts\\/[a-zA-Z0-9._-]+\\.sh(?:\\s+.*)?$',
        },
        description: {
          type: 'string',
          description: 'Command description (optional)',
          maxLength: 240,
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default 60000)',
          minimum: 1000,
          maximum: 120000,
        }
      },
      required: ['command']
    }
  };

  async execute(args: any, context: ToolExecutionContext): Promise<string> {
    const { command, description, timeout = 60000 } = args;

    if (!command) {
      return 'Error: no command provided.';
    }

    const startTime = Date.now();

    try {
      const normalizedCommand = String(command).trim();
      this.assertSafeCommand(normalizedCommand);

      const tokens = splitCommand(normalizedCommand);
      const clampedTimeout = Math.max(1_000, Math.min(Number(timeout) || 60_000, 120_000));
      const { stdout, stderr } = await this.runCommandSegment(tokens, context, clampedTimeout);
      const output = (stdout || '').trim();

      let result = '';
      if (description) {
        result += `[${description}]\n`;
      }
      result += output || (stderr ? `[stderr] ${stderr.trim()}` : '');

      return result || '(Command succeeded with no output)';
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      const errorOutput = error.stderr || error.stdout || error.message;
      throw new Error(`Command execution failed (duration: ${executionTime}ms):\n$ ${command}\n\nError: ${errorOutput}`);
    }
  }

  private assertSafeCommand(command: string): void {
    if (command.length > 600) {
      throw new Error('Command is too long.');
    }

    if (!command.startsWith('bash scripts/')) {
      throw new Error('Only "bash scripts/<script>.sh [args...]" command format is allowed.');
    }

    if (/[\r\n]/.test(command)) {
      throw new Error('Multi-line commands are not allowed.');
    }

    if (command.includes('&&') || command.includes('||')) {
      throw new Error('Command chaining is not allowed.');
    }

    if (/[;|`><]/.test(command) || command.includes('$(')) {
      throw new Error('Shell control characters are not allowed.');
    }
  }

  private async runCommandSegment(
    tokens: string[],
    context: ToolExecutionContext,
    timeout: number,
  ): Promise<{ stdout: string; stderr: string }> {
    if (tokens.length < 2 || tokens[0] !== 'bash') {
      throw new Error('Only "bash scripts/<script>.sh [args...]" command format is allowed.');
    }

    const scriptPath = resolveAllowedScript(tokens[1]);
    const scriptArgs = tokens.slice(2);
    validateScriptArgs(scriptPath, scriptArgs);
    if (scriptArgs.length > 48) {
      throw new Error('Too many script arguments.');
    }
    for (const arg of scriptArgs) {
      if (arg.length > 4_000) {
        throw new Error('Script argument is too long.');
      }
      if (/[\u0000-\u001F\u007F]/.test(arg)) {
        throw new Error('Control characters are not allowed in arguments.');
      }
    }

    const env = {
      ...process.env,
      ZJ_USER_ID: context.userId || 'local',
      ZJ_PLATFORM: context.platform || 'cli',
      ZJ_DATA_DIR: context.dataDirectory || '',
      ZJ_CONTEXT_DIR: context.contextDirectory || '',
      ZJ_SESSION_FILE: context.sessionFile || '',
      ZJ_MEDIA_INDEX_FILE: context.mediaIndexFile || '',
      ZJ_ACTIVE_MEDIA_IDS: JSON.stringify(context.activeMediaIds || []),
    };

    return execFileAsync('bash', [scriptPath, ...scriptArgs], {
      cwd: context.workingDirectory || process.cwd(),
      encoding: 'utf-8',
      timeout,
      maxBuffer: 10 * 1024 * 1024,
      env,
    });
  }
}

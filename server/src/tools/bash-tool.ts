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
          description: 'Script command to execute. Must be bash scripts/<script>.sh ...'
        },
        description: {
          type: 'string',
          description: 'Command description (optional)'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default 60000)'
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
      const tokens = splitCommand(String(command));
      const commandSegments = this.splitByAndAnd(tokens);
      const outputs: string[] = [];

      for (const segment of commandSegments) {
        const { stdout, stderr } = await this.runCommandSegment(segment, context, timeout);
        const output = (stdout || '').trim();
        if (output) {
          outputs.push(output);
        } else if (stderr) {
          outputs.push(`[stderr] ${stderr.trim()}`);
        }
      }

      let result = '';
      if (description) {
        result += `[${description}]\n`;
      }
      result += outputs.join('\n');

      return result || '(Command succeeded with no output)';
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      const errorOutput = error.stderr || error.stdout || error.message;

      return `Command execution failed (duration: ${executionTime}ms):\n$ ${command}\n\nError: ${errorOutput}`;
    }
  }

  private splitByAndAnd(tokens: string[]): string[][] {
    const segments: string[][] = [];
    let current: string[] = [];

    for (const token of tokens) {
      if (token === '&&') {
        if (current.length === 0) {
          throw new Error('Invalid command: left side of && is empty.');
        }
        segments.push(current);
        current = [];
        continue;
      }

      current.push(token);
    }

    if (current.length === 0) {
      throw new Error('Invalid command: right side of && is empty.');
    }
    segments.push(current);

    return segments;
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

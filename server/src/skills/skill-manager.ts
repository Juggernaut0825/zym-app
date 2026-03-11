import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const SCRIPT_BY_SKILL: Record<string, string> = {
  log_workout: 'log-workout.sh',
  log_meal: 'log-meal.sh',
  get_profile: 'get-profile.sh',
};

function sanitizeUserId(userId: unknown): string {
  const normalized = String(userId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(normalized)) {
    throw new Error('Invalid userId');
  }
  return normalized;
}

function resolveAllowedScript(skillName: string): string {
  const scriptName = SCRIPT_BY_SKILL[skillName];
  if (!scriptName) {
    throw new Error(`No script configured for skill: ${skillName}`);
  }

  const scriptsDir = path.resolve(process.cwd(), 'scripts');
  const realScriptsDir = fs.realpathSync(scriptsDir);
  const candidate = path.join(scriptsDir, scriptName);

  if (!fs.existsSync(candidate)) {
    throw new Error(`Script not found: ${scriptName}`);
  }

  const realCandidate = fs.realpathSync(candidate);
  if (!realCandidate.startsWith(`${realScriptsDir}${path.sep}`)) {
    throw new Error('Script path escapes allowed scripts directory');
  }

  return realCandidate;
}

async function runSkillScript(skillName: string, userId: unknown, payload: unknown): Promise<string> {
  const scriptPath = resolveAllowedScript(skillName);
  const safeUserId = sanitizeUserId(userId);
  const serializedPayload = JSON.stringify(payload ?? {});
  const { stdout } = await execFileAsync('bash', [scriptPath, safeUserId, serializedPayload], {
    cwd: process.cwd(),
    maxBuffer: 4 * 1024 * 1024,
    timeout: 60_000,
    encoding: 'utf8',
  });
  return String(stdout || '');
}

export interface Skill {
  name: string;
  description: string;
  parameters: any;
  execute: (params: any) => Promise<string>;
}

export class SkillManager {
  private skills: Map<string, Skill> = new Map();

  constructor() {
    this.registerSkills();
  }

  private registerSkills() {
    this.skills.set('log_workout', {
      name: 'log_workout',
      description: 'Log a workout session',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          exercise: { type: 'string' },
          sets: { type: 'number' },
          reps: { type: 'number' },
          weight: { type: 'number' }
        },
        required: ['userId', 'exercise']
      },
      execute: async (params) => {
        return runSkillScript('log_workout', params?.userId, params);
      }
    });

    this.skills.set('log_meal', {
      name: 'log_meal',
      description: 'Log a meal',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          meal: { type: 'string' },
          calories: { type: 'number' },
          protein: { type: 'number' },
          carbs: { type: 'number' },
          fats: { type: 'number' }
        },
        required: ['userId', 'meal']
      },
      execute: async (params) => {
        return runSkillScript('log_meal', params?.userId, params);
      }
    });

    this.skills.set('get_profile', {
      name: 'get_profile',
      description: 'Get user profile',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string' }
        },
        required: ['userId']
      },
      execute: async (params) => {
        return runSkillScript('get_profile', params?.userId, params);
      }
    });
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  getAllSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  getToolDefinitions() {
    return this.getAllSkills().map(skill => ({
      name: skill.name,
      description: skill.description,
      input_schema: skill.parameters
    }));
  }
}

export const skillManager = new SkillManager();

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
        const data = JSON.stringify(params);
        const { stdout } = await execAsync(`./scripts/log-workout.sh "${params.userId}" '${data}'`);
        return stdout;
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
        const data = JSON.stringify(params);
        const { stdout } = await execAsync(`./scripts/log-meal.sh "${params.userId}" '${data}'`);
        return stdout;
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
        const { stdout } = await execAsync(`./scripts/get-profile.sh "${params.userId}"`);
        return stdout;
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

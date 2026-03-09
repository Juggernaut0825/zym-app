import fs from 'fs/promises';
import path from 'path';
import { UserProfile } from '../types.js';

export class ProfileService {
  private dataDir = './data';

  private getUserDir(userId: string): string {
    return path.join(this.dataDir, userId);
  }

  private getProfilePath(userId: string): string {
    return path.join(this.getUserDir(userId), 'profile.json');
  }

  async getProfile(userId: string): Promise<UserProfile> {
    try {
      const data = await fs.readFile(this.getProfilePath(userId), 'utf-8');
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  async updateGoal(userId: string, goal: 'bulk' | 'cut' | 'maintain'): Promise<void> {
    const profile = await this.getProfile(userId);
    profile.goal = goal;
    await this.saveProfile(userId, profile);
  }

  async updateMetrics(userId: string, metrics: { weight?: number; bodyFat?: number }): Promise<void> {
    const profile = await this.getProfile(userId);
    if (metrics.weight) profile.weight = metrics.weight;
    if (metrics.bodyFat) profile.bodyFat = metrics.bodyFat;

    if (profile.weight && profile.height && profile.age && profile.gender) {
      profile.bmr = this.calculateBMR(profile);
      profile.tdee = this.calculateTDEE(profile.bmr, profile.activityLevel || 'moderate');
    }

    await this.saveProfile(userId, profile);
  }

  private calculateBMR(profile: UserProfile): number {
    const { weight, height, age, gender } = profile;
    if (!weight || !height || !age || !gender) return 0;

    if (gender === 'male') {
      return 10 * weight + 6.25 * height - 5 * age + 5;
    } else {
      return 10 * weight + 6.25 * height - 5 * age - 161;
    }
  }

  private calculateTDEE(bmr: number, activityLevel: string): number {
    const multipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };
    return bmr * (multipliers[activityLevel as keyof typeof multipliers] || 1.55);
  }

  private async saveProfile(userId: string, profile: UserProfile): Promise<void> {
    const userDir = this.getUserDir(userId);
    await fs.mkdir(userDir, { recursive: true });
    await fs.writeFile(this.getProfilePath(userId), JSON.stringify(profile, null, 2));
  }
}

export const profileService = new ProfileService();

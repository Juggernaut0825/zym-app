import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { resolveSkillScriptPath } from '../utils/path-resolver.js';

const execFileAsync = promisify(execFile);

export class MediaService {
  static async convertHEIC(inputPath: string): Promise<string> {
    const outputPath = /\.(heic|heif)$/i.test(inputPath)
      ? inputPath.replace(/\.(heic|heif)$/i, '.jpg')
      : `${inputPath}.jpg`;

    try {
      await execFileAsync('sips', ['-s', 'format', 'jpeg', inputPath, '--out', outputPath], {
        timeout: 30_000,
      });
      return outputPath;
    } catch (sipsErr) {
      try {
        const source = await fs.promises.readFile(inputPath);
        const { default: heicConvert } = await import('heic-convert');
        const converted = await heicConvert({
          buffer: source,
          format: 'JPEG',
          quality: 0.9,
        });
        await fs.promises.writeFile(outputPath, Buffer.from(converted as ArrayBuffer));
        return outputPath;
      } catch (fallbackErr) {
        const sipsMessage = sipsErr instanceof Error ? sipsErr.message : String(sipsErr);
        const fallbackMessage = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        console.error('[media] HEIC conversion failed', { sipsMessage, fallbackMessage });
        throw new Error('HEIC/HEIF conversion failed for this file');
      }
    }
  }

  static async analyzeFood(imagePath: string): Promise<any> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is required');
    }

    const imageData = fs.readFileSync(imagePath, { encoding: 'base64' });
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.GAUZ_LLM_MODEL || 'google/gemini-3-flash-preview',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this food image. Estimate calories, protein, carbs, fat. Return JSON: {food: string, calories: number, protein: number, carbs: number, fat: number}' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageData}` } }
          ]
        }]
      })
    });
    const data = await response.json();
    const raw = String(data?.choices?.[0]?.message?.content || '')
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    return JSON.parse(raw);
  }

  static async analyzeForm(videoPath: string): Promise<string> {
    const script = resolveSkillScriptPath('analyze-form.sh');
    const { stdout } = await execFileAsync('bash', [script, videoPath], {
      env: process.env,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    });
    return stdout.trim();
  }
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function looksLikeSkillRoot(candidate: string): boolean {
  const hasScripts = fs.existsSync(path.join(candidate, 'scripts'));
  const hasTrackedStructure =
    fs.existsSync(path.join(candidate, 'SKILL.md'))
    || fs.existsSync(path.join(candidate, '.env.example'))
    || fs.existsSync(path.join(candidate, 'references'));
  const hasLocalEnv = fs.existsSync(path.join(candidate, '.env'));
  return hasScripts && (hasTrackedStructure || hasLocalEnv);
}

export function resolveSkillRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), 'skills/z'),
    path.resolve(process.cwd(), '../server/skills/z'),
    path.resolve(process.cwd(), '../zym-app/server/skills/z'),
    path.resolve(process.cwd(), '../skill-z/skills/z'),
    path.resolve(process.cwd(), 'skill-z/skills/z'),
    path.resolve(moduleDir, '../../../skill-z/skills/z'),
    path.resolve(moduleDir, '../../../../skill-z/skills/z'),
    path.resolve(moduleDir, '../../skills/z'),
    path.resolve(moduleDir, '../../../skills/z'),
  ];

  const match = candidates.find(looksLikeSkillRoot);
  if (!match) {
    throw new Error('Unable to locate the skill-z/skills/z directory.');
  }

  return match;
}

export function resolveUserDataDir(userId: string): string {
  return path.join(resolveSkillRoot(), 'data', sanitizeUserId(userId));
}

export function resolveSkillScriptPath(scriptName: string): string {
  return path.join(resolveSkillRoot(), 'scripts', scriptName);
}

export function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

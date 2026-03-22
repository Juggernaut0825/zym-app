import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveAppDataRoot } from '../config/app-paths.js';

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
  const configured = String(process.env.COACH_SKILL_ROOT || '').trim();
  if (configured) {
    const resolved = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
    if (!looksLikeSkillRoot(resolved)) {
      throw new Error(`Configured COACH_SKILL_ROOT does not look like a valid skill root: ${resolved}`);
    }
    return resolved;
  }

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
  return path.join(resolveAppDataRoot(), sanitizeUserId(userId));
}

function isWithinRoot(candidate: string, root: string): boolean {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

export function resolveUserScopedPath(userId: string, storedPath: string): string {
  const normalized = String(storedPath || '').trim();
  if (!normalized) {
    throw new Error('Stored path is required');
  }

  const userRoot = resolveUserDataDir(userId);
  if (path.isAbsolute(normalized)) {
    const absoluteCandidate = path.resolve(normalized);
    if (!isWithinRoot(absoluteCandidate, userRoot)) {
      throw new Error('Stored path is outside the allowed user data directory');
    }
    return absoluteCandidate;
  }

  let parts = normalized.replace(/\\/g, '/').split('/').filter((segment) => segment && segment !== '.');
  if (parts.includes('..')) {
    throw new Error('Stored path is outside the allowed user data directory');
  }

  const sanitizedUserId = sanitizeUserId(userId);
  if (parts[0] === 'data' && parts[1] === sanitizedUserId) {
    parts = parts.slice(2);
  } else if (parts[0] === sanitizedUserId) {
    parts = parts.slice(1);
  }

  const absoluteCandidate = path.resolve(userRoot, ...parts);
  if (!isWithinRoot(absoluteCandidate, userRoot)) {
    throw new Error('Stored path is outside the allowed user data directory');
  }

  return absoluteCandidate;
}

export function resolveSkillScriptPath(scriptName: string): string {
  return path.join(resolveSkillRoot(), 'scripts', scriptName);
}

export function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

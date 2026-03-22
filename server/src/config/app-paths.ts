import fs from 'fs';
import path from 'path';

function resolveConfiguredPath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(process.cwd(), value);
}

export function resolveAppDataRoot(): string {
  const configured = String(
    process.env.APP_DATA_ROOT
    || process.env.SHARED_DATA_ROOT
    || '',
  ).trim();

  if (configured) {
    return resolveConfiguredPath(configured);
  }

  return path.join(process.cwd(), 'data');
}

export function resolveUploadsDir(): string {
  return path.join(resolveAppDataRoot(), 'uploads');
}

export function ensureAppDataDirs(): void {
  for (const dirPath of [resolveAppDataRoot(), resolveUploadsDir()]) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

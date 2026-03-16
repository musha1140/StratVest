import fs from 'node:fs/promises';
import path from 'node:path';
import { stableJson } from './json.js';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tempPath = `${filePath}.tmp-${Date.now()}`;
  await fs.writeFile(tempPath, stableJson(value), 'utf8');
  await fs.rename(tempPath, filePath);
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function listDirectories(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return [];
    throw error;
  }
}

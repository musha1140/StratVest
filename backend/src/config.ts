import path from 'node:path';

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function readNumber(value: string | undefined, fallback: number): number {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: readNumber(process.env.PORT, 8787),
  host: process.env.HOST || '0.0.0.0',
  dataDir: path.resolve(process.env.DATA_DIR || './data'),
  workerConcurrency: Math.max(1, readNumber(process.env.WORKER_CONCURRENCY, 2)),
  navigationTimeoutMs: Math.max(5_000, readNumber(process.env.NAVIGATION_TIMEOUT_MS, 45_000)),
  waitUntil: (process.env.WAIT_UNTIL as 'load' | 'domcontentloaded' | 'networkidle' | 'commit' | undefined) || 'load',
  lighthouseTimeoutMs: Math.max(10_000, readNumber(process.env.LIGHTHOUSE_TIMEOUT_MS, 90_000)),
  playwrightHeadless: readBoolean(process.env.PLAYWRIGHT_HEADLESS, true),
  ignoreHttpsErrors: readBoolean(process.env.IGNORE_HTTPS_ERRORS, false),
  chromePath: process.env.CHROME_PATH || undefined,
  userAgent:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (compatible; URLIntentAuditor/1.0; +https://localhost)',
} as const;

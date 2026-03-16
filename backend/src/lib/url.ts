import { HttpError } from './http-error.js';
import type { SandboxConfig, RunCreateRequest } from '../types.js';
import { config } from '../config.js';

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new HttpError(400, 'targetUrl is required');
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new HttpError(400, 'targetUrl must be a valid absolute URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new HttpError(400, 'Only http and https URLs are supported');
  }

  url.hash = '';
  return url.toString();
}

export function buildSandboxConfig(request: RunCreateRequest): SandboxConfig {
  const incoming = request.sandbox ?? {};
  return {
    screenshot: incoming.screenshot ?? true,
    devtoolsTrace: incoming.devtoolsTrace ?? true,
    lighthouse: incoming.lighthouse ?? true,
    captureHeaders: incoming.captureHeaders ?? true,
    timeoutMs: Math.max(5_000, Math.min(incoming.timeoutMs ?? config.navigationTimeoutMs, 120_000)),
    waitUntil: incoming.waitUntil ?? config.waitUntil,
    headless: incoming.headless ?? config.playwrightHeadless,
  };
}

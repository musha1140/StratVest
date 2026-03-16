import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { config } from '../config.js';
import type { LighthouseArtifact, LighthouseIssue } from '../types.js';
import type { RunStore } from '../store/run-store.js';

type LighthouseRunnerResult = Awaited<ReturnType<typeof lighthouse>>;

function buildIssues(result: NonNullable<LighthouseRunnerResult>): LighthouseIssue[] {
  const audits = result.lhr.audits as Record<string, any>;
  return Object.entries(audits)
    .filter(([, audit]) => {
      if (audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'manual') {
        return false;
      }
      if (typeof audit.score === 'number') {
        return audit.score < 0.9;
      }
      return audit.scoreDisplayMode === 'error' || audit.scoreDisplayMode === 'binary';
    })
    .slice(0, 30)
    .map(([id, audit]) => ({
      id,
      title: audit.title,
      scoreDisplayMode: audit.scoreDisplayMode,
      score: typeof audit.score === 'number' ? audit.score : null,
      description: audit.description,
    }));
}

export async function runLighthouseAudit(
  runId: string,
  runStore: RunStore,
  targetUrl: string,
): Promise<LighthouseArtifact> {
  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
    chromePath: config.chromePath,
    logLevel: 'error',
  });

  try {
    const result = await lighthouse(targetUrl, {
      port: chrome.port,
      logLevel: 'error',
      output: 'html',
      maxWaitForLoad: config.lighthouseTimeoutMs,
    });

    if (!result) {
      throw new Error('Lighthouse returned no result');
    }

    const htmlReport = typeof result.report === 'string' ? result.report : result.report[0];
    const jsonPath = await runStore.writeArtifact(runId, 'lighthouse.json', result.lhr);
    await runStore.writeTextArtifact(runId, 'lighthouse.html', htmlReport);

    const categories = Object.fromEntries(
      Object.entries(result.lhr.categories as Record<string, any>).map(([key, category]) => [key, Math.round((category.score || 0) * 100)]),
    );

    return {
      finalDisplayedUrl: result.lhr.finalDisplayedUrl,
      fetchTime: result.lhr.fetchTime,
      userAgent: result.lhr.userAgent,
      runtimeError: result.lhr.runtimeError
        ? {
            code: result.lhr.runtimeError.code,
            message: result.lhr.runtimeError.message,
          }
        : undefined,
      runWarnings: result.lhr.runWarnings || [],
      categories,
      issues: buildIssues(result),
      jsonArtifact: jsonPath,
      htmlArtifact: 'lighthouse.html',
    };
  } finally {
    await chrome.kill();
  }
}

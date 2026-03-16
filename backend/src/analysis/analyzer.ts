import { readJson } from '../lib/fs.js';
import type {
  CdnCorrelationArtifact,
  FetchProfileArtifact,
  IntentScoreArtifact,
  LighthouseArtifact,
  MarkerArtifact,
  PlaywrightCaptureArtifact,
  RequestRecord,
} from '../types.js';
import { runFetchProfile } from '../agents/fetch-profile.js';
import { runPlaywrightCapture } from '../agents/playwright-capture.js';
import { runLighthouseAudit } from '../agents/lighthouse-audit.js';
import { runCdnCorrelation } from '../agents/cdn-correlator.js';
import { runMarkerDetector } from '../agents/marker-detector.js';
import { runIntentScorer } from '../agents/intent-scorer.js';
import type { RunStore } from '../store/run-store.js';

async function withAgent<T>(
  runStore: RunStore,
  runId: string,
  agentId: string,
  notes: string,
  job: () => Promise<T>,
): Promise<T> {
  await runStore.updateAgent(runId, agentId, {
    status: 'running',
    startedAt: new Date().toISOString(),
    notes,
    error: undefined,
  });

  try {
    const result = await job();
    await runStore.updateAgent(runId, agentId, {
      status: 'done',
      finishedAt: new Date().toISOString(),
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await runStore.updateAgent(runId, agentId, {
      status: 'failed',
      finishedAt: new Date().toISOString(),
      error: message,
    });
    throw error;
  }
}

export class RunAnalyzer {
  private readonly runStore: RunStore;

  constructor(runStore: RunStore) {
    this.runStore = runStore;
  }

  async analyze(runId: string): Promise<void> {
    const manifest = await this.runStore.getRun(runId);
    await this.runStore.setRunStatus(runId, 'running');

    try {
      const fetchProfile: FetchProfileArtifact = await withAgent(
        this.runStore,
        runId,
        'fetch-profile',
        'Resolving redirects, headers, security headers, and robots.txt.',
        async () => {
          const artifact = await runFetchProfile(manifest.normalizedUrl);
          await this.runStore.writeArtifact(runId, 'fetch-profile.json', artifact);
          await this.runStore.updateRun(runId, (current) => ({
            ...current,
            finalUrl: artifact.finalUrl,
          }));
          return artifact;
        },
      );

      const capture: PlaywrightCaptureArtifact = await withAgent(
        this.runStore,
        runId,
        'playwright-capture',
        'Capturing page, requests, HAR, trace, DOM inventory, cookies, and console output.',
        async () => {
          const artifact = await runPlaywrightCapture(runId, this.runStore, manifest.normalizedUrl, manifest.sandbox);
          await this.runStore.writeArtifact(runId, 'playwright-capture.json', artifact);
          return artifact;
        },
      );

      const requests = await readJson<RequestRecord[]>(this.runStore.artifactPath(runId, 'requests.json'));

      let lighthouse: LighthouseArtifact | undefined;
      if (manifest.sandbox.lighthouse) {
        lighthouse = await withAgent(
          this.runStore,
          runId,
          'lighthouse-audit',
          'Running Lighthouse in a separate Chrome debugging session.',
          async () => runLighthouseAudit(runId, this.runStore, manifest.normalizedUrl),
        );
      } else {
        await this.runStore.updateAgent(runId, 'lighthouse-audit', {
          status: 'skipped',
          finishedAt: new Date().toISOString(),
          notes: 'Disabled by sandbox configuration.',
        });
      }

      const cdnCorrelation: CdnCorrelationArtifact = await withAgent(
        this.runStore,
        runId,
        'cdn-correlator',
        'Mapping script and stylesheet assets to likely package identities.',
        async () => {
          const artifact = runCdnCorrelation(capture, requests);
          await this.runStore.writeArtifact(runId, 'cdn-correlation.json', artifact);
          return artifact;
        },
      );

      const markers: MarkerArtifact = await withAgent(
        this.runStore,
        runId,
        'marker-detector',
        'Applying explainable marker rules to the captured evidence.',
        async () => {
          const artifact = runMarkerDetector({
            fetchProfile,
            capture,
            requests,
            cdn: cdnCorrelation,
            lighthouse,
          });
          await this.runStore.writeArtifact(runId, 'markers.json', artifact);
          return artifact;
        },
      );

      const intentScore: IntentScoreArtifact = await withAgent(
        this.runStore,
        runId,
        'intent-scorer',
        'Generating final score, risk tier, and summary.',
        async () => {
          const artifact = runIntentScorer(markers);
          await this.runStore.writeArtifact(runId, 'intent-score.json', artifact);
          return artifact;
        },
      );

      await this.runStore.writeArtifact(runId, 'report.json', {
        targetUrl: manifest.targetUrl,
        normalizedUrl: manifest.normalizedUrl,
        finalUrl: capture.page.finalUrl,
        score: intentScore.score,
        risk: intentScore.risk,
        summary: intentScore.summary,
        markers: markers.markers,
      });

      await this.runStore.updateRun(runId, (current) => ({
        ...current,
        status: 'succeeded',
        completedAt: new Date().toISOString(),
        finalUrl: capture.page.finalUrl,
        score: intentScore.score,
        risk: intentScore.risk,
        summary: intentScore.summary,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown analysis error';
      await this.runStore.updateRun(runId, (current) => ({
        ...current,
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: message,
      }));
      throw error;
    }
  }
}

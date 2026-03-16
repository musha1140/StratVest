import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { HttpError } from '../lib/http-error.js';
import { createRunId } from '../lib/id.js';
import { ensureDir, listDirectories, readJson, writeJsonAtomic } from '../lib/fs.js';
import type { AgentState, RunManifest, SandboxConfig } from '../types.js';

const AGENTS: ReadonlyArray<Pick<AgentState, 'id' | 'name'>> = [
  { id: 'fetch-profile', name: 'Fetch Profile' },
  { id: 'playwright-capture', name: 'Playwright Capture' },
  { id: 'lighthouse-audit', name: 'Lighthouse Audit' },
  { id: 'cdn-correlator', name: 'CDN Correlator' },
  { id: 'marker-detector', name: 'Marker Detector' },
  { id: 'intent-scorer', name: 'Intent Scorer' },
];

export class RunStore {
  public readonly rootDir: string;
  public readonly runsDir: string;

  constructor(rootDir = config.dataDir) {
    this.rootDir = rootDir;
    this.runsDir = path.join(rootDir, 'runs');
  }

  async init(): Promise<void> {
    await ensureDir(this.runsDir);
  }

  private runDir(runId: string): string {
    return path.join(this.runsDir, runId);
  }

  private manifestPath(runId: string): string {
    return path.join(this.runDir(runId), 'manifest.json');
  }

  artifactPath(runId: string, fileName: string): string {
    return path.join(this.runDir(runId), fileName);
  }

  async createRun(targetUrl: string, normalizedUrl: string, sandbox: SandboxConfig): Promise<RunManifest> {
    const id = createRunId();
    const manifest: RunManifest = {
      id,
      targetUrl,
      normalizedUrl,
      status: 'queued',
      createdAt: new Date().toISOString(),
      sandbox,
      agents: AGENTS.map((agent) => ({
        ...agent,
        status: agent.id === 'lighthouse-audit' && !sandbox.lighthouse ? 'skipped' : 'queued',
      })),
      artifacts: {},
    };

    await ensureDir(this.runDir(id));
    await writeJsonAtomic(this.manifestPath(id), manifest);
    return manifest;
  }

  async getRun(runId: string): Promise<RunManifest> {
    try {
      return await readJson<RunManifest>(this.manifestPath(runId));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new HttpError(404, `Run not found: ${runId}`);
      }
      throw error;
    }
  }

  async listRuns(limit = 50): Promise<RunManifest[]> {
    const runIds = await listDirectories(this.runsDir);
    const manifests = await Promise.all(
      runIds.map(async (runId) => {
        try {
          return await this.getRun(runId);
        } catch {
          return null;
        }
      }),
    );

    return manifests
      .filter((item): item is RunManifest => item !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async updateRun(runId: string, updater: (current: RunManifest) => RunManifest): Promise<RunManifest> {
    const current = await this.getRun(runId);
    const next = updater(current);
    await writeJsonAtomic(this.manifestPath(runId), next);
    return next;
  }

  async setRunStatus(runId: string, status: RunManifest['status'], error?: string): Promise<RunManifest> {
    return this.updateRun(runId, (current) => ({
      ...current,
      status,
      startedAt: status === 'running' ? current.startedAt ?? new Date().toISOString() : current.startedAt,
      completedAt: status === 'succeeded' || status === 'failed' ? new Date().toISOString() : current.completedAt,
      error,
    }));
  }

  async updateAgent(runId: string, agentId: string, patch: Partial<AgentState>): Promise<RunManifest> {
    return this.updateRun(runId, (current) => ({
      ...current,
      agents: current.agents.map((agent) =>
        agent.id === agentId
          ? {
              ...agent,
              ...patch,
            }
          : agent,
      ),
    }));
  }

  async writeArtifact<T>(runId: string, fileName: string, value: T): Promise<string> {
    const artifactPath = this.artifactPath(runId, fileName);
    await writeJsonAtomic(artifactPath, value);
    await this.updateRun(runId, (current) => ({
      ...current,
      artifacts: {
        ...current.artifacts,
        [fileName]: fileName,
      },
    }));
    return fileName;
  }

  async writeTextArtifact(runId: string, fileName: string, text: string): Promise<string> {
    const artifactPath = this.artifactPath(runId, fileName);
    await ensureDir(path.dirname(artifactPath));
    await fs.writeFile(artifactPath, text, 'utf8');
    await this.updateRun(runId, (current) => ({
      ...current,
      artifacts: {
        ...current.artifacts,
        [fileName]: fileName,
      },
    }));
    return fileName;
  }
}

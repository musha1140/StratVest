import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { HttpError } from '../lib/http-error.js';
import { buildSandboxConfig, normalizeUrl } from '../lib/url.js';
import type { RunAnalyzer } from '../analysis/analyzer.js';
import type { RunQueue } from '../queue/run-queue.js';
import type { RunCreateRequest } from '../types.js';
import type { RunStore } from '../store/run-store.js';

export function buildRunsRouter(deps: {
  runStore: RunStore;
  queue: RunQueue;
  analyzer: RunAnalyzer;
}): Router {
  const router = Router();

  router.get('/api/runs', async (_req, res) => {
    const runs = await deps.runStore.listRuns();
    res.json({ runs });
  });

  router.post('/api/runs', async (req, res) => {
    const body = (req.body || {}) as RunCreateRequest;
    const normalizedUrl = normalizeUrl(body.targetUrl);
    const sandbox = buildSandboxConfig(body);
    const run = await deps.runStore.createRun(body.targetUrl, normalizedUrl, sandbox);
    deps.queue.enqueue(run.id);
    res.status(202).json({
      runId: run.id,
      status: run.status,
      manifest: run,
    });
  });

  router.get('/api/runs/:id', async (req, res) => {
    const run = await deps.runStore.getRun(req.params.id);
    res.json({ run });
  });

  router.get('/api/runs/:id/artifacts', async (req, res) => {
    const run = await deps.runStore.getRun(req.params.id);
    res.json({
      runId: run.id,
      artifacts: Object.keys(run.artifacts).sort(),
    });
  });

  router.get('/api/runs/:id/artifacts/:name', async (req, res) => {
    const run = await deps.runStore.getRun(req.params.id);
    const artifactName = req.params.name;

    if (!run.artifacts[artifactName]) {
      throw new HttpError(404, `Artifact not found: ${artifactName}`);
    }

    const artifactPath = deps.runStore.artifactPath(run.id, artifactName);
    await fs.access(artifactPath);
    res.sendFile(path.resolve(artifactPath));
  });

  return router;
}

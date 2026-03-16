import express from 'express';
import type { RunAnalyzer } from './analysis/analyzer.js';
import type { RunQueue } from './queue/run-queue.js';
import type { RunStore } from './store/run-store.js';
import { HttpError } from './lib/http-error.js';
import { buildRunsRouter } from './routes/runs.js';
import { buildSystemRouter } from './routes/system.js';

export function buildApp(deps: {
  runStore: RunStore;
  queue: RunQueue;
  analyzer: RunAnalyzer;
}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Prefix all routes with '/api' so the frontend can call a single base path.
  app.use('/api', buildSystemRouter());
  app.use('/api', buildRunsRouter(deps));

  // view-source proxy. Fetches remote HTML and returns the raw markup as JSON.
  app.get('/api/view-source', async (req, res, next) => {
    const urlString = typeof req.query.url === 'string' ? req.query.url : undefined;
    if (!urlString) {
      res.status(400).json({ error: 'Missing url query parameter' });
      return;
    }
    try {
      const response = await fetch(urlString);
      const text = await response.text();
      res.status(200).json({ html: text });
    } catch (err) {
      next(err);
    }
  });

  app.use((_req, _res, next) => {
    next(new HttpError(404, 'Not found'));
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.statusCode).json({
        error: error.message,
        details: error.details,
      });
      return;
    }

    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({
      error: message,
    });
  });

  return app;
}

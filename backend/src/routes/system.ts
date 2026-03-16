import { Router } from 'express';

export function buildSystemRouter(): Router {
  const router = Router();

  router.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

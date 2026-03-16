import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Import backend components from the compiled code. Because the backend
// compiles TypeScript into ESM modules in `backend/dist`, we can import
// directly from those compiled modules.
import { RunStore } from './backend/dist/store/run-store.js';
import { RunAnalyzer } from './backend/dist/analysis/analyzer.js';
import { RunQueue } from './backend/dist/queue/run-queue.js';
import { buildApp } from './backend/dist/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createBackend() {
  const runStore = new RunStore();
  await runStore.init();
  const analyzer = new RunAnalyzer(runStore);
  const queue = new RunQueue(1, (runId) => analyzer.analyze(runId));
  return buildApp({ runStore, queue, analyzer });
}

async function start() {
  const apiApp = await createBackend();
  const app = express();
  // API app already defines routes under /api, so mount it at root.
  app.use(apiApp);
  // Serve static frontend assets
  const staticPath = path.join(__dirname, 'frontend/dist');
  app.use(express.static(staticPath));
  // Client-side routing fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
  const port = process.env.PORT || 8080;
  app.listen(port, () => {
    console.log(`StratVest running on port ${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
import { config } from './config.js';
import { buildApp } from './app.js';
import { RunStore } from './store/run-store.js';
import { RunQueue } from './queue/run-queue.js';
import { RunAnalyzer } from './analysis/analyzer.js';

async function main(): Promise<void> {
  const runStore = new RunStore();
  await runStore.init();

  const analyzer = new RunAnalyzer(runStore);
  const queue = new RunQueue(config.workerConcurrency, (runId) => analyzer.analyze(runId));
  const app = buildApp({ runStore, queue, analyzer });

  app.listen(config.port, config.host, () => {
    console.log(`URL Intent Auditor backend listening on http://${config.host}:${config.port}`);
    console.log(`Artifacts root: ${runStore.rootDir}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

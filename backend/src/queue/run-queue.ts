type QueueHandler = (runId: string) => Promise<void>;

export class RunQueue {
  private readonly concurrency: number;
  private readonly handler: QueueHandler;
  private readonly pending: string[] = [];
  private readonly queued = new Set<string>();
  private active = 0;

  constructor(concurrency: number, handler: QueueHandler) {
    this.concurrency = concurrency;
    this.handler = handler;
  }

  enqueue(runId: string): void {
    if (this.queued.has(runId)) return;
    this.queued.add(runId);
    this.pending.push(runId);
    void this.drain();
  }

  private async drain(): Promise<void> {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const runId = this.pending.shift();
      if (!runId) break;

      this.active += 1;
      this.queued.delete(runId);

      void this.handler(runId)
        .catch(() => {
          // analyzer persists the failed state
        })
        .finally(() => {
          this.active -= 1;
          void this.drain();
        });
    }
  }
}

import { randomUUID } from 'node:crypto';

export function createRunId(): string {
  return `run_${randomUUID().replace(/-/g, '')}`;
}

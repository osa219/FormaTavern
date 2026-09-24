import { ulid } from 'ulid';
import type { SyncReport } from '@formatavern/shared';
import type { ImportRunStatus } from './contracts';

export class ImportRunManager {
  private runs = new Map<string, ImportRunStatus>();
  private readonly maxAgeMs: number;

  constructor(maxAgeMs = 3600_000) {
    this.maxAgeMs = maxAgeMs;
  }

  startRun(task: () => Promise<SyncReport>): string {
    this.cleanup();
    const runId = 'run_' + ulid().toLowerCase();
    const status: ImportRunStatus = {
      runId,
      status: 'running',
      startedAt: Date.now()
    };
    this.runs.set(runId, status);

    // Launch asynchronously in background
    (async () => {
      try {
        const report = await task();
        const current = this.runs.get(runId);
        if (current) {
          current.status = 'done';
          current.completedAt = Date.now();
          current.report = report;
        }
      } catch (err: any) {
        const current = this.runs.get(runId);
        if (current) {
          current.status = 'error';
          current.completedAt = Date.now();
          current.error = err?.message || 'Unknown import error';
        }
      }
    })();

    return runId;
  }

  getRun(runId: string): ImportRunStatus | null {
    return this.runs.get(runId) ?? null;
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.maxAgeMs;
    for (const [id, run] of this.runs.entries()) {
      if (run.startedAt < cutoff) {
        this.runs.delete(id);
      }
    }
  }
}

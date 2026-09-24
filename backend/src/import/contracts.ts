import type { SyncReport } from '@formatavern/shared';

export interface SyncOptions {
  root?: string;
  file?: string;
  dryRun?: boolean;
  limit?: number;
  characterOriginId?: string;
  batchSize?: number;
}

export interface ImportService {
  sync(targetPath: string, opts?: SyncOptions): Promise<SyncReport>;
}

export interface ImportRunStatus {
  runId: string;
  status: 'running' | 'done' | 'error';
  startedAt: number;
  completedAt?: number;
  report?: SyncReport;
  error?: string;
}

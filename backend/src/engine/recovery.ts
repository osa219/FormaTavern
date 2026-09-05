import type { Repositories } from '../db/contracts';

export interface RecoveryResult {
  recoveredCount: number;
  messageIds: string[];
}

export function recoverStaleGenerations(repos: Repositories): RecoveryResult {
  const messageIds = repos.messages.markStaleStreamingAsAborted();
  return {
    recoveredCount: messageIds.length,
    messageIds
  };
}

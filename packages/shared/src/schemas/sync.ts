import { Type, type Static } from '@sinclair/typebox';

export const QuarantinedChatSchema = Type.Object({
  chatId: Type.String(),
  characterOriginId: Type.String(),
  reason: Type.String()
});
export type QuarantinedChat = Static<typeof QuarantinedChatSchema>;

export const SyncReportSchema = Type.Object({
  scanned: Type.Integer({ minimum: 0 }),
  skipped: Type.Integer({ minimum: 0 }),
  insertedChars: Type.Integer({ minimum: 0 }),
  updatedChars: Type.Integer({ minimum: 0 }),
  insertedChats: Type.Integer({ minimum: 0 }),
  appendedMessages: Type.Integer({ minimum: 0 }),
  reusedBlobs: Type.Integer({ minimum: 0 }),
  copiedBlobs: Type.Integer({ minimum: 0 }),
  missingAssets: Type.Array(Type.String()),
  quarantinedChats: Type.Array(QuarantinedChatSchema),
  durationMs: Type.Integer({ minimum: 0 })
});
export type SyncReport = Static<typeof SyncReportSchema>;

export const SyncRunStatusSchema = Type.Union([
  Type.Literal('running'),
  Type.Literal('done'),
  Type.Literal('error')
]);
export type SyncRunStatus = Static<typeof SyncRunStatusSchema>;

export const SyncRunResponseSchema = Type.Object({
  runId: Type.String(),
  status: SyncRunStatusSchema,
  report: Type.Optional(SyncReportSchema),
  error: Type.Optional(Type.String())
});
export type SyncRunResponse = Static<typeof SyncRunResponseSchema>;

export const SyncRequestSchema = Type.Object({
  root: Type.String({ minLength: 1 })
});
export type SyncRequest = Static<typeof SyncRequestSchema>;

import { Type, type Static } from '@sinclair/typebox';
import { Id, UnixMs } from './primitives';
import {
  MessageRoleSchema,
  NarrativeRoleSchema,
  SegmentSchema,
  type MessageRole,
  type NarrativeRole
} from './narrative';
import { StateVectorSchema } from './state';

export const MessageStatusSchema = Type.Union([
  Type.Literal('streaming'),
  Type.Literal('complete'),
  Type.Literal('aborted'),
  Type.Literal('error')
]);
export type MessageStatus = Static<typeof MessageStatusSchema>;

export const StateSourceSchema = Type.Union([
  Type.Literal('initial'),
  Type.Literal('patch'),
  Type.Literal('inherited'),
  Type.Literal('override')
]);
export type StateSource = Static<typeof StateSourceSchema>;

export const ParseReportSchema = Type.Object({
  dialect: Type.Union([
    Type.Literal('directive'),
    Type.Literal('xml'),
    Type.Literal('prefix'),
    Type.Literal('none')
  ]),
  parserVersion: Type.Integer(),
  adherent: Type.Boolean(),
  warnings: Type.Array(Type.String()),
  truncatedAt: Type.Union([Type.Literal('persona'), Type.Null()])
});
export type ParseReport = Static<typeof ParseReportSchema>;

export const MessageMetricsSchema = Type.Object({
  provider: Type.String(),
  model: Type.String(),
  promptTokensEstimated: Type.Integer(),
  promptTokens: Type.Optional(Type.Integer()),
  completionTokens: Type.Optional(Type.Integer()),
  durationMs: Type.Integer(),
  ttftMs: Type.Optional(Type.Integer()),
  finishReason: Type.Optional(Type.Union([
    Type.Literal('stop'),
    Type.Literal('length'),
    Type.Literal('aborted')
  ])),
  droppedTurns: Type.Integer()
});
export type MessageMetrics = Static<typeof MessageMetricsSchema>;

export const MessageMetadataSchema = Type.Object({
  directorNote: Type.Optional(Type.String()),
  parse: Type.Optional(ParseReportSchema),
  stateSource: Type.Optional(StateSourceSchema),
  stateWarnings: Type.Optional(Type.Array(Type.String())),
  stateOverrides: Type.Optional(Type.Array(Type.Object({
    at: UnixMs,
    patch: StateVectorSchema
  }))),
  reasoning: Type.Optional(Type.String()),
  reasoningDurationMs: Type.Optional(Type.Integer()),
  error: Type.Optional(Type.Object({
    message: Type.String(),
    recoverable: Type.Boolean()
  })),
  edited: Type.Optional(Type.Object({
    at: UnixMs,
    count: Type.Integer()
  })),
  continuations: Type.Optional(Type.Integer()),
  recovered: Type.Optional(Type.Boolean())
});
export type MessageMetadata = Static<typeof MessageMetadataSchema>;

export const MessageViewSchema = Type.Object({
  id: Id,
  chatId: Id,
  parentId: Type.Union([Id, Type.Null()]),
  role: MessageRoleSchema,
  narrativeRole: NarrativeRoleSchema,
  senderId: Type.Union([Type.String(), Type.Null()]),
  senderName: Type.Union([Type.String(), Type.Null()]),
  content: Type.String(),
  segments: Type.Array(SegmentSchema),
  state: Type.Union([StateVectorSchema, Type.Null()]),
  status: MessageStatusSchema,
  createdAt: UnixMs,
  metrics: Type.Union([MessageMetricsSchema, Type.Null()]),
  metadata: MessageMetadataSchema,
  siblingIndex: Type.Integer(),
  siblingCount: Type.Integer(),
  hasChildren: Type.Boolean()
});
export type MessageView = Static<typeof MessageViewSchema>;
export type MessageWithTree = MessageView;

export const SendMessageBodySchema = Type.Object({
  message: Type.Optional(Type.String({ maxLength: 32_000 })),
  directorNote: Type.Optional(Type.String({ maxLength: 4_000 })),
  narrativeRole: Type.Optional(Type.Union([
    Type.Literal('persona'),
    Type.Literal('narrator'),
    Type.Literal('npc'),
    Type.Literal('character')
  ])),
  senderName: Type.Optional(Type.String({ maxLength: 120 })),
  parentId: Type.Optional(Id),
  generate: Type.Optional(Type.Boolean())
});
export type SendMessageBody = Static<typeof SendMessageBodySchema>;

export const MessagePatchSchema = Type.Union([
  Type.Object({ content: Type.String() }),
  Type.Object({
    segments: Type.Array(SegmentSchema),
    statePatch: Type.Optional(Type.Union([StateVectorSchema, Type.Null()]))
  })
]);
export type MessagePatch = Static<typeof MessagePatchSchema>;

export const StatePatchBodySchema = Type.Object({
  state: StateVectorSchema
});
export type StatePatchBody = Static<typeof StatePatchBodySchema>;

export const MessagesPageQuerySchema = Type.Object({
  before: Type.Optional(Id),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 }))
});
export type MessagesPageQuery = Static<typeof MessagesPageQuerySchema>;

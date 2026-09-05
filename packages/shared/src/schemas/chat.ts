import { Type, type Static } from '@sinclair/typebox';
import { Id, UnixMs } from './primitives';
import { ChatMetadataSchema } from './narrative';

export const ChatCreateSchema = Type.Object({
  characterId: Id,
  personaId: Type.Optional(Id),
  title: Type.Optional(Type.String({ maxLength: 200 })),
  narrativeMode: Type.Optional(Type.Union([
    Type.Literal('classic'),
    Type.Literal('narrative')
  ])),
  envelopeDialect: Type.Optional(Type.Union([
    Type.Literal('directive'),
    Type.Literal('xml'),
    Type.Literal('prefix')
  ]))
});
export type ChatCreate = Static<typeof ChatCreateSchema>;

export const ChatPatchSchema = Type.Object({
  title: Type.Optional(Type.String({ maxLength: 200 })),
  metadata: Type.Optional(Type.Partial(ChatMetadataSchema))
});
export type ChatPatch = Static<typeof ChatPatchSchema>;

export const ChatViewSchema = Type.Object({
  id: Id,
  title: Type.String(),
  primaryCharacterId: Id,
  activePersonaId: Id,
  createdAt: UnixMs,
  updatedAt: UnixMs,
  metadata: ChatMetadataSchema,
  activeLeafId: Type.Union([Id, Type.Null()]),
  activeGenerationMessageId: Type.Union([Id, Type.Null()]),
  messageCount: Type.Integer()
});
export type ChatView = Static<typeof ChatViewSchema>;

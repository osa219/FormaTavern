import { Type, type Static } from '@sinclair/typebox';
import { Id, UnixMs } from './primitives';
import { ChatMetadataSchema } from './narrative';
import { CharacterSummarySchema } from './character';

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
  activePersonaId: Type.Optional(Id),
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

export const ChatListItemSchema = Type.Object({
  id: Id,
  title: Type.String(),
  primaryCharacterId: Id,
  activePersonaId: Id,
  personaId: Id,
  activeLeafId: Type.Union([Id, Type.Null()]),
  activeGenerationMessageId: Type.Union([Id, Type.Null()]),
  createdAt: UnixMs,
  updatedAt: UnixMs,
  metadata: ChatMetadataSchema,
  messageCount: Type.Integer(),
  turnCount: Type.Integer()
});
export type ChatListItem = Static<typeof ChatListItemSchema>;

export const ChatConvertBodySchema = Type.Object({
  targetDialect: Type.Union([
    Type.Literal('directive'),
    Type.Literal('xml'),
    Type.Literal('prefix')
  ])
});
export type ChatConvertBody = Static<typeof ChatConvertBodySchema>;

export const ChatListQuerySchema = Type.Object({
  characterId: Type.Optional(Id),
  limit: Type.Optional(
    Type.Union([
      Type.Integer({ minimum: 1, maximum: 100 }),
      Type.String({ pattern: '^[0-9]+$' })
    ])
  ),
  cursor: Type.Optional(Type.String())
});
export type ChatListQuery = Static<typeof ChatListQuerySchema>;

export const ChatHubRecentItemSchema = Type.Object({
  id: Id,
  title: Type.Union([Type.String(), Type.Null()]),
  messageCount: Type.Integer({ minimum: 0 }),
  updatedAt: UnixMs,
  activeGenerationMessageId: Type.Union([Id, Type.Null()])
});
export type ChatHubRecentItem = Static<typeof ChatHubRecentItemSchema>;

export const ChatHubCharacterSchema = Type.Composite([
  CharacterSummarySchema,
  Type.Object({
    description: Type.Optional(Type.String())
  })
]);
export type ChatHubCharacter = Static<typeof ChatHubCharacterSchema>;

export const ChatHubGroupSchema = Type.Object({
  character: ChatHubCharacterSchema,
  chatCount: Type.Integer({ minimum: 0 }),
  lastChatAt: UnixMs,
  recentChats: Type.Array(ChatHubRecentItemSchema)
});
export type ChatHubGroup = Static<typeof ChatHubGroupSchema>;

export const ChatHubSortSchema = Type.Union([
  Type.Literal('recent'),
  Type.Literal('chats'),
  Type.Literal('name')
]);
export type ChatHubSort = Static<typeof ChatHubSortSchema>;

export const ChatHubQuerySchema = Type.Object({
  limit: Type.Optional(
    Type.Union([
      Type.Integer({ minimum: 1, maximum: 50 }),
      Type.String({ pattern: '^[0-9]+$' })
    ], { default: 20 })
  ),
  cursor: Type.Optional(Type.String()),
  q: Type.Optional(Type.String()),
  sort: Type.Optional(ChatHubSortSchema)
});
export type ChatHubQuery = Static<typeof ChatHubQuerySchema>;

export const ChatHubResponseSchema = Type.Object({
  items: Type.Array(ChatHubGroupSchema),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
  totalCharacters: Type.Integer({ minimum: 0 }),
  totalChats: Type.Integer({ minimum: 0 })
});
export type ChatHubResponse = Static<typeof ChatHubResponseSchema>;

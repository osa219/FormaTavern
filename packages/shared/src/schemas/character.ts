import { Type, type Static } from '@sinclair/typebox';
import { Id, AssetPath, UnixMs } from './primitives';
import { CharacterThemeSchema } from './theme';
import { StateFieldSchema, StateBindingSchema, StateVectorSchema } from './state';

export const TagSchema = Type.String({ pattern: '^[a-z0-9][a-z0-9-]{0,23}$' });
export type Tag = Static<typeof TagSchema>;

export const CharacterCardSchema = Type.Object({
  $schema: Type.Optional(Type.String()),
  id: Id,
  name: Type.String({ minLength: 1, maxLength: 120 }),
  avatar: Type.Optional(AssetPath),
  tagline: Type.Optional(Type.String({ maxLength: 140 })),
  description: Type.String(),
  personality: Type.String(),
  scenario: Type.String(),
  firstMessage: Type.String(),
  exampleDialogue: Type.Optional(Type.String()), // Amendment A2
  style: CharacterThemeSchema,
  stateSchema: Type.Optional(Type.Record(Type.String(), StateFieldSchema)),
  stateBindings: Type.Optional(Type.Array(StateBindingSchema)),
  initialState: Type.Optional(StateVectorSchema),
  tags: Type.Optional(Type.Array(TagSchema, { default: [], maxItems: 12, uniqueItems: true })),
  creator: Type.Optional(Type.String({ maxLength: 80 })),
  showcase: Type.Optional(Type.String({ maxLength: 65_536 })), // Display only (P4)
  customCss: Type.Optional(Type.String({ maxLength: 131_072 })), // raw authored CSS; sanitized at render (C10)
  version: Type.Optional(Type.String()),
  createdAt: Type.Optional(UnixMs),
  updatedAt: Type.Optional(UnixMs)
});
export type CharacterCard = Static<typeof CharacterCardSchema>;

export const CharacterSummarySchema = Type.Object({
  id: Id,
  name: Type.String(),
  tagline: Type.Optional(Type.String()),
  avatar: Type.Optional(AssetPath),
  creator: Type.Optional(Type.String()),
  tags: Type.Array(TagSchema),
  style: CharacterThemeSchema,
  storyCount: Type.Integer({ minimum: 0 }),
  lastStoryAt: Type.Optional(UnixMs),
  updatedAt: UnixMs
});
export type CharacterSummary = Static<typeof CharacterSummarySchema>;

export const CharacterCreateSchema = Type.Composite([
  Type.Omit(CharacterCardSchema, ['id', 'createdAt', 'updatedAt']),
  Type.Object({
    id: Type.Optional(Id)
  })
]);
export type CharacterCreate = Static<typeof CharacterCreateSchema>;

export const CharacterPatchSchema = Type.Composite([
  Type.Partial(Type.Omit(CharacterCardSchema, ['id', 'createdAt', 'updatedAt', 'customCss'])),
  Type.Object({
    expectedUpdatedAt: UnixMs,
    customCss: Type.Optional(Type.Union([Type.String({ maxLength: 131_072 }), Type.Null()]))
  })
]);
export type CharacterPatch = Static<typeof CharacterPatchSchema>;

export const CharacterSortSchema = Type.Union([
  Type.Literal('recent'),
  Type.Literal('name'),
  Type.Literal('stories')
]);
export type CharacterSort = Static<typeof CharacterSortSchema>;

export const CharacterListQuerySchema = Type.Object({
  q: Type.Optional(Type.String()),
  tags: Type.Optional(Type.String()),
  sort: Type.Optional(CharacterSortSchema),
  limit: Type.Optional(
    Type.Union([
      Type.Integer({ minimum: 1, maximum: 60 }),
      Type.String({ pattern: '^[0-9]+$' })
    ], { default: 24 })
  ),
  cursor: Type.Optional(Type.String())
});
export type CharacterListQuery = Static<typeof CharacterListQuerySchema>;

/** Shape of characters.metadata (JSON column). Everything not in a dedicated column lives here. */
export const CharacterMetadataSchema = Type.Object({
  exampleDialogue: Type.Optional(Type.String()),
  stateSchema: Type.Optional(Type.Record(Type.String(), StateFieldSchema)),
  stateBindings: Type.Optional(Type.Array(StateBindingSchema)),
  initialState: Type.Optional(StateVectorSchema),
  tags: Type.Optional(Type.Array(Type.String())),
  creator: Type.Optional(Type.String()),
  version: Type.Optional(Type.String())
});
export type CharacterMetadata = Static<typeof CharacterMetadataSchema>;

import { Type, type Static } from '@sinclair/typebox';
import { Id, AssetPath, HttpUrl, UnixMs } from './primitives';
import { CharacterThemeSchema } from './theme';
import { StateFieldSchema, StateBindingSchema, StateVectorSchema } from './state';
import { CharacterLayoutSchema } from './layout';

export const TagSchema = Type.String({ pattern: '^[a-z0-9][a-z0-9-]{0,23}$' });
export type Tag = Static<typeof TagSchema>;

export const GreetingModeSchema = Type.Union([
  Type.Literal('prologue'),
  Type.Literal('split'),
  Type.Literal('ai')
]);
export type GreetingMode = Static<typeof GreetingModeSchema>;

/**
 * Reviewed envelope overrides for greetings (directive-canonical text).
 * `first` overrides firstMessage; `alternates` overrides by alternate index.
 * The stored greetings are never rewritten: classical chats always use the
 * authentic text, envelope chats use the override when present.
 */
export const GreetingEnvelopeSchema = Type.Object({
  first: Type.Optional(Type.String()),
  alternates: Type.Optional(Type.Record(Type.String(), Type.String()))
});
export type GreetingEnvelope = Static<typeof GreetingEnvelopeSchema>;

export const CharacterCardSchema = Type.Object({
  $schema: Type.Optional(Type.String()),
  id: Id,
  name: Type.String({ minLength: 1, maxLength: 120 }),
  characterName: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  avatar: Type.Optional(AssetPath),
  tagline: Type.Optional(Type.String({ maxLength: 140 })),
  description: Type.String(),
  personality: Type.String(),
  scenario: Type.String(),
  firstMessage: Type.String(),
  alternateGreetings: Type.Optional(Type.Array(Type.String(), { minItems: 0 })),
  greetingMode: Type.Optional(GreetingModeSchema),
  greetingEnvelope: Type.Optional(GreetingEnvelopeSchema),
  exampleDialogue: Type.Optional(Type.String()), // Amendment A2
  style: CharacterThemeSchema,
  stateSchema: Type.Optional(Type.Record(Type.String(), StateFieldSchema)),
  stateBindings: Type.Optional(Type.Array(StateBindingSchema)),
  initialState: Type.Optional(StateVectorSchema),
  tags: Type.Optional(Type.Array(TagSchema, { default: [], maxItems: 12, uniqueItems: true })),
  creator: Type.Optional(Type.String({ maxLength: 80 })),
  creatorUrl: Type.Optional(HttpUrl),
  characterUrl: Type.Optional(HttpUrl),
  origin: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  labels: Type.Optional(Type.Object({
    startStory: Type.Optional(Type.String({ maxLength: 40 }))
  })),
  showcase: Type.Optional(Type.String({ maxLength: 65_536 })), // Display only (P4)
  customCss: Type.Optional(Type.String({ maxLength: 131_072 })), // raw authored CSS; sanitized at render (C10)
  layout: Type.Optional(CharacterLayoutSchema),
  version: Type.Optional(Type.String()),
  createdAt: Type.Optional(UnixMs),
  updatedAt: Type.Optional(UnixMs)
});
export type CharacterCard = Static<typeof CharacterCardSchema>;

export const CharacterSummarySchema = Type.Object({
  id: Id,
  name: Type.String(),
  characterName: Type.Optional(Type.String()),
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

/**
 * Lenient draft-card input for the Studio prompt preview. Unlike create,
 * every field is optional and blank strings are accepted: they fall back to
 * neutral defaults server-side so an unsaved, half-filled card still previews.
 */
export const CharacterPromptPreviewBodySchema = Type.Object({
  card: Type.Optional(
    Type.Composite([
      Type.Omit(Type.Partial(CharacterCreateSchema), ['id', 'name']),
      Type.Object({ name: Type.Optional(Type.String({ maxLength: 120 })) })
    ])
  ),
  personaId: Type.Optional(Id)
});
export type CharacterPromptPreviewBody = Static<typeof CharacterPromptPreviewBodySchema>;

export const CharacterPatchSchema = Type.Composite([
  Type.Partial(Type.Omit(CharacterCardSchema, ['id', 'createdAt', 'updatedAt', 'customCss', 'layout'])),
  Type.Object({
    expectedUpdatedAt: UnixMs,
    customCss: Type.Optional(Type.Union([Type.String({ maxLength: 131_072 }), Type.Null()])),
    layout: Type.Optional(Type.Union([CharacterLayoutSchema, Type.Null()]))
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
  creator: Type.Optional(Type.String({ maxLength: 80 })),
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
  greetingMode: Type.Optional(GreetingModeSchema),
  greetingEnvelope: Type.Optional(GreetingEnvelopeSchema),
  exampleDialogue: Type.Optional(Type.String()),
  stateSchema: Type.Optional(Type.Record(Type.String(), StateFieldSchema)),
  stateBindings: Type.Optional(Type.Array(StateBindingSchema)),
  initialState: Type.Optional(StateVectorSchema),
  tags: Type.Optional(Type.Array(Type.String())),
  creator: Type.Optional(Type.String()),
  characterName: Type.Optional(Type.String()),
  creatorUrl: Type.Optional(HttpUrl),
  characterUrl: Type.Optional(HttpUrl),
  origin: Type.Optional(Type.String()),
  labels: Type.Optional(Type.Object({
    startStory: Type.Optional(Type.String({ maxLength: 40 }))
  })),
  version: Type.Optional(Type.String())
});
export type CharacterMetadata = Static<typeof CharacterMetadataSchema>;

/**
 * Drop blank entries from an alternate-greetings list. Shared so Studio
 * (client) and the repository layer (server) agree on what gets persisted.
 * Never mutates the input.
 */
export function pruneAlternateGreetings(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    if (item.trim() === '') continue;
    out.push(item);
  }
  return out;
}

/** Primary greeting + pruned alternates. Index 0 is always `firstMessage`. */
export function allGreetings(card: { firstMessage: string; alternateGreetings?: string[] }): string[] {
  return [card.firstMessage, ...pruneAlternateGreetings(card.alternateGreetings)];
}

/** Clamp a requested greeting index into a valid range. Out-of-range → 0. */
export function clampGreetingIndex(index: unknown, count: number): number {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return 0;
  if (count <= 0) return 0;
  return index < count ? index : 0;
}

/**
 * Card vs character distinction: `name` is the card/catalog title,
 * `characterName` is the in-world identity used for {{char}}, dialogue
 * tags, and sender snapshots. Falls back to the card name so legacy
 * cards without a split keep working.
 */
export function resolveCharacterName(card: { name: string; characterName?: string | null }): string {
  const trimmed = typeof card.characterName === 'string' ? card.characterName.trim() : '';
  return trimmed.length > 0 ? trimmed : card.name;
}

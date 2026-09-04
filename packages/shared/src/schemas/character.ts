import { Type, type Static } from '@sinclair/typebox';
import { Id, AssetPath } from './primitives';
import { CharacterThemeSchema } from './theme';
import { StateFieldSchema, StateBindingSchema, StateVectorSchema } from './state';

export const CharacterCardSchema = Type.Object({
  $schema: Type.Optional(Type.String()),
  id: Id,
  name: Type.String({ minLength: 1, maxLength: 120 }),
  avatar: Type.Optional(AssetPath),
  description: Type.String(),
  personality: Type.String(),
  scenario: Type.String(),
  firstMessage: Type.String(),
  exampleDialogue: Type.Optional(Type.String()), // Amendment A2
  style: CharacterThemeSchema,
  stateSchema: Type.Optional(Type.Record(Type.String(), StateFieldSchema)),
  stateBindings: Type.Optional(Type.Array(StateBindingSchema)),
  initialState: Type.Optional(StateVectorSchema),
  tags: Type.Optional(Type.Array(Type.String())),
  creator: Type.Optional(Type.String()),
  version: Type.Optional(Type.String())
});
export type CharacterCard = Static<typeof CharacterCardSchema>;

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

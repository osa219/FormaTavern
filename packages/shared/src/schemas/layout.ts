import { Type, type Static } from '@sinclair/typebox';
import { CssToken } from './primitives';

export const LayoutAlignSchema = Type.Union([
  Type.Literal('uniform-left'),
  Type.Literal('split')
]);
export type LayoutAlign = Static<typeof LayoutAlignSchema>;

export const LayoutContainerSchema = Type.Union([
  Type.Literal('row'),
  Type.Literal('bubble'),
  Type.Literal('flat')
]);
export type LayoutContainer = Static<typeof LayoutContainerSchema>;

export const LayoutHeadersSchema = Type.Union([
  Type.Literal('single'),
  Type.Literal('voices')
]);
export type LayoutHeaders = Static<typeof LayoutHeadersSchema>;

export const LayoutNarratorSchema = Type.Union([
  Type.Literal('dim-only'),
  Type.Literal('inline'),
  Type.Literal('centered')
]);
export type LayoutNarrator = Static<typeof LayoutNarratorSchema>;

export const LayoutNameFormatSchema = Type.Union([
  Type.Literal('plain'),
  Type.Literal('classic')
]);
export type LayoutNameFormat = Static<typeof LayoutNameFormatSchema>;

export const CharacterAvatarsSchema = Type.Object({
  character: Type.Boolean({ default: false }),
  persona: Type.Boolean({ default: false }),
  npc: Type.Boolean({ default: false }),
  shape: Type.Union(
    [Type.Literal('circle'), Type.Literal('rounded'), Type.Literal('square')],
    { default: 'circle' }
  ),
  size: Type.Optional(CssToken) // default '2rem', applied as --msg-avatar-size
});
export type CharacterAvatars = Static<typeof CharacterAvatarsSchema>;

export const CharacterNamesSchema = Type.Object({
  showCharacter: Type.Boolean({ default: true }),
  showPersona: Type.Boolean({ default: true }),
  showNpc: Type.Boolean({ default: true }),
  format: Type.Optional(LayoutNameFormatSchema) // default 'plain'
});
export type CharacterNames = Static<typeof CharacterNamesSchema>;

export const CharacterLayoutSchema = Type.Object({
  align: Type.Optional(LayoutAlignSchema),
  container: Type.Optional(LayoutContainerSchema),
  headers: Type.Optional(LayoutHeadersSchema), // undefined = follow the chat mode (§2.3)
  avatars: Type.Optional(CharacterAvatarsSchema),
  narrator: Type.Optional(LayoutNarratorSchema),
  names: Type.Optional(CharacterNamesSchema),
  tails: Type.Optional(Type.Boolean())
});
export type CharacterLayout = Static<typeof CharacterLayoutSchema>;

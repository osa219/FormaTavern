import { Type, type Static } from '@sinclair/typebox';
import { Id, AssetPath } from './primitives';
import { ThemeOverridesSchema } from './theme';

export const PersonaSchema = Type.Object({
  id: Id,
  name: Type.String({ minLength: 1, maxLength: 120 }),
  avatar: Type.Optional(AssetPath),
  description: Type.String(),
  isDefault: Type.Boolean({ default: false }),
  styleOverrides: Type.Optional(ThemeOverridesSchema)
});
export type Persona = Static<typeof PersonaSchema>;

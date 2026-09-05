import { Type, type Static } from '@sinclair/typebox';
import { Id, AssetPath, UnixMs } from './primitives';
import { ThemeOverridesSchema } from './theme';

export const PersonaSchema = Type.Object({
  id: Id,
  name: Type.String({ minLength: 1, maxLength: 120 }),
  avatar: Type.Optional(AssetPath),
  description: Type.String(),
  isDefault: Type.Boolean({ default: false }),
  styleOverrides: Type.Optional(ThemeOverridesSchema),
  createdAt: Type.Optional(UnixMs),
  updatedAt: Type.Optional(UnixMs)
});
export type Persona = Static<typeof PersonaSchema>;

export const PersonaCreateSchema = Type.Composite([
  Type.Omit(PersonaSchema, ['id', 'isDefault', 'createdAt', 'updatedAt']),
  Type.Object({
    id: Type.Optional(Id),
    isDefault: Type.Optional(Type.Boolean({ default: false }))
  })
]);
export type PersonaCreate = Static<typeof PersonaCreateSchema>;

export const PersonaPatchSchema = Type.Composite([
  Type.Partial(Type.Omit(PersonaSchema, ['id', 'createdAt', 'updatedAt'])),
  Type.Object({
    expectedUpdatedAt: UnixMs
  })
]);
export type PersonaPatch = Static<typeof PersonaPatchSchema>;

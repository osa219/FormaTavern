import { Type, type Static } from '@sinclair/typebox';

export const StateFieldSchema = Type.Union([
  Type.Object({
    type: Type.Literal('enum'),
    values: Type.Array(Type.String()),
    aliases: Type.Optional(Type.Record(Type.String(), Type.String())),
    default: Type.String()
  }),
  Type.Object({
    type: Type.Literal('int'),
    min: Type.Number(),
    max: Type.Number(),
    default: Type.Number()
  }),
  Type.Object({
    type: Type.Literal('string'),
    default: Type.String()
  })
]);
export type StateField = Static<typeof StateFieldSchema>;

export const StateBindingSchema = Type.Object({
  when: Type.Record(Type.String(), Type.Unknown()), // e.g. { mood: 'furious' }
  set: Type.Record(Type.String(), Type.String()) // Dotted theme paths: { 'colors.accent': '#dc2626' }
});
export type StateBinding = Static<typeof StateBindingSchema>;

export const StateVectorSchema = Type.Record(Type.String(), Type.Unknown());
export type StateVector = Static<typeof StateVectorSchema>;

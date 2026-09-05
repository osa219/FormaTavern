import { Type, type Static } from '@sinclair/typebox';

export const SegmentKindSchema = Type.Union(
  (['narrator', 'character', 'npc', 'persona'] as const).map((k) => Type.Literal(k))
);
export type SegmentKind = Static<typeof SegmentKindSchema>;

export const SegmentSchema = Type.Object({
  kind: SegmentKindSchema,
  name: Type.Optional(Type.String()),
  text: Type.String()
});
export type Segment = Static<typeof SegmentSchema>;

export const ChatMetadataSchema = Type.Object({
  narrativeMode: Type.Optional(Type.Union([Type.Literal('classic'), Type.Literal('narrative')])),
  envelopeDialect: Type.Optional(Type.Union([Type.Literal('directive'), Type.Literal('xml'), Type.Literal('prefix')])),
  standingDirection: Type.Optional(Type.String()),
  npcs: Type.Optional(
    Type.Record(
      Type.String(),
      Type.Object({
        displayName: Type.String(),
        avatar: Type.Optional(Type.String()),
        accent: Type.Optional(Type.String()),
        voice: Type.Optional(Type.String())
      })
    )
  ),
  currentState: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
});
export type ChatMetadata = Static<typeof ChatMetadataSchema>;

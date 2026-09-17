import { Type, type Static } from '@sinclair/typebox';
import { UnixMs } from './primitives';

export const MessageRoleSchema = Type.Union([
  Type.Literal('user'),
  Type.Literal('assistant'),
  Type.Literal('system')
]);
export type MessageRole = Static<typeof MessageRoleSchema>;

export const NarrativeRoleSchema = Type.Union([
  Type.Literal('character'),
  Type.Literal('persona'),
  Type.Literal('npc'),
  Type.Literal('narrator')
]);
export type NarrativeRole = Static<typeof NarrativeRoleSchema>;

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

export const StateOverrideSchema = Type.Object({
  appliedAt: UnixMs,
  patch: Type.Record(Type.String(), Type.Unknown()),
  resolved: Type.Record(Type.String(), Type.Unknown()),
  source: Type.String()
});
export type StateOverride = Static<typeof StateOverrideSchema>;

export const PersonaVoicingPolicy = Type.Union([
  Type.Literal('prohibited'),
  Type.Literal('allowed')
]);
export type PersonaVoicingPolicy = Static<typeof PersonaVoicingPolicy>;

export const ChatMetadataSchema = Type.Object({
  narrativeMode: Type.Optional(Type.Union([Type.Literal('classic'), Type.Literal('narrative')])),
  envelopeDialect: Type.Optional(Type.Union([Type.Literal('directive'), Type.Literal('xml'), Type.Literal('prefix')])),
  personaVoicing: Type.Optional(Type.Union([PersonaVoicingPolicy, Type.Null()])),
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
  currentState: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  stateOverrides: Type.Optional(Type.Array(StateOverrideSchema))
});
export type ChatMetadata = Static<typeof ChatMetadataSchema>;

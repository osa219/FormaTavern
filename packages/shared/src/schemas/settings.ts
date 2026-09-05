import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const AppSettingsSchema = Type.Object({
  provider: Type.Object({
    id: Type.Union([Type.Literal('mock'), Type.Literal('openrouter')], { default: 'mock' }),
    model: Type.Optional(Type.String())
  }, { default: { id: 'mock' } }),
  openrouter: Type.Object({
    apiKey: Type.Optional(Type.String())
  }, { default: {} }),
  generation: Type.Object({
    temperature: Type.Number({ minimum: 0, maximum: 2, default: 0.8 }),
    maxTokens: Type.Integer({ minimum: 16, maximum: 32_000, default: 1024 }),
    contextLength: Type.Integer({ minimum: 1024, default: 16_384 }),
    topP: Type.Optional(Type.Number()),
    topK: Type.Optional(Type.Integer()),
    minP: Type.Optional(Type.Number()),
    repetitionPenalty: Type.Optional(Type.Number())
  }, { default: { temperature: 0.8, maxTokens: 1024, contextLength: 16_384 } }),
  narrative: Type.Object({
    defaultMode: Type.Union([Type.Literal('classic'), Type.Literal('narrative')], { default: 'narrative' }),
    defaultDialect: Type.Union([
      Type.Literal('directive'),
      Type.Literal('xml'),
      Type.Literal('prefix')
    ], { default: 'directive' })
  }, { default: { defaultMode: 'narrative', defaultDialect: 'directive' } }),
  preamble: Type.Optional(Type.String({ maxLength: 20_000 }))
});
export type AppSettings = Static<typeof AppSettingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = Value.Default(AppSettingsSchema, {}) as AppSettings;

export const SettingsViewSchema = Type.Object({
  provider: Type.Object({
    id: Type.Union([Type.Literal('mock'), Type.Literal('openrouter')]),
    model: Type.Optional(Type.String())
  }),
  openrouter: Type.Object({
    apiKeySet: Type.Boolean(),
    apiKeyHint: Type.Union([Type.String(), Type.Null()]),
    source: Type.Union([Type.Literal('settings'), Type.Literal('env'), Type.Literal('none')])
  }),
  generation: Type.Object({
    temperature: Type.Number(),
    maxTokens: Type.Integer(),
    contextLength: Type.Integer(),
    topP: Type.Optional(Type.Number()),
    topK: Type.Optional(Type.Integer()),
    minP: Type.Optional(Type.Number()),
    repetitionPenalty: Type.Optional(Type.Number())
  }),
  narrative: Type.Object({
    defaultMode: Type.Union([Type.Literal('classic'), Type.Literal('narrative')]),
    defaultDialect: Type.Union([
      Type.Literal('directive'),
      Type.Literal('xml'),
      Type.Literal('prefix')
    ])
  }),
  preamble: Type.Optional(Type.String())
});
export type SettingsView = Static<typeof SettingsViewSchema>;

export const SettingsPatchSchema = Type.Object({
  provider: Type.Optional(Type.Partial(Type.Object({
    id: Type.Union([Type.Literal('mock'), Type.Literal('openrouter')]),
    model: Type.Optional(Type.String())
  }))),
  openrouter: Type.Optional(Type.Object({
    apiKey: Type.Union([Type.String({ minLength: 1 }), Type.Null()])
  })),
  generation: Type.Optional(Type.Partial(Type.Object({
    temperature: Type.Number({ minimum: 0, maximum: 2 }),
    maxTokens: Type.Integer({ minimum: 16, maximum: 32_000 }),
    contextLength: Type.Integer({ minimum: 1024 }),
    topP: Type.Optional(Type.Number()),
    topK: Type.Optional(Type.Integer()),
    minP: Type.Optional(Type.Number()),
    repetitionPenalty: Type.Optional(Type.Number())
  }))),
  narrative: Type.Optional(Type.Partial(Type.Object({
    defaultMode: Type.Union([Type.Literal('classic'), Type.Literal('narrative')]),
    defaultDialect: Type.Union([
      Type.Literal('directive'),
      Type.Literal('xml'),
      Type.Literal('prefix')
    ])
  }))),
  preamble: Type.Optional(Type.Union([Type.String({ maxLength: 20_000 }), Type.Null()]))
});
export type SettingsPatch = Static<typeof SettingsPatchSchema>;

import { Type, type Static } from '@sinclair/typebox';

export const PROVIDER_CONFIG_TYPES = ['openrouter', 'custom', 'gemini', 'gemini-interactions'] as const;
export type ProviderConfigType = (typeof PROVIDER_CONFIG_TYPES)[number];

export const ProviderConfigTypeSchema = Type.Union(
  PROVIDER_CONFIG_TYPES.map((t) => Type.Literal(t))
);

export const PROVIDER_CONFIG_NAME_MAX = 64;
export const PROVIDER_CONFIG_PROMPT_MAX = 2000;

export const ProviderConfigSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1, maxLength: PROVIDER_CONFIG_NAME_MAX }),
  providerType: ProviderConfigTypeSchema,
  baseUrl: Type.Optional(Type.String()),
  apiKey: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
  customPrompt: Type.Optional(Type.String({ maxLength: PROVIDER_CONFIG_PROMPT_MAX })),
  createdAt: Type.Integer({ minimum: 0 }),
  updatedAt: Type.Integer({ minimum: 0 })
});
export type ProviderConfig = Static<typeof ProviderConfigSchema>;

export const ProviderConfigViewSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  providerType: ProviderConfigTypeSchema,
  baseUrl: Type.Union([Type.String(), Type.Null()]),
  model: Type.Union([Type.String(), Type.Null()]),
  customPrompt: Type.Union([Type.String(), Type.Null()]),
  apiKeySet: Type.Boolean(),
  apiKeyHint: Type.Union([Type.String(), Type.Null()]),
  source: Type.Union([Type.Literal('settings'), Type.Literal('env'), Type.Literal('none')]),
  createdAt: Type.Integer(),
  updatedAt: Type.Integer()
});
export type ProviderConfigView = Static<typeof ProviderConfigViewSchema>;

export const ProviderConfigCreateSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: PROVIDER_CONFIG_NAME_MAX }),
  providerType: ProviderConfigTypeSchema,
  baseUrl: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  apiKey: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  model: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
  customPrompt: Type.Optional(
    Type.Union([Type.String({ maxLength: PROVIDER_CONFIG_PROMPT_MAX }), Type.Null()])
  )
});
export type ProviderConfigCreate = Static<typeof ProviderConfigCreateSchema>;

export const ProviderConfigPatchSchema = Type.Partial(
  Type.Object({
    name: Type.String({ minLength: 1, maxLength: PROVIDER_CONFIG_NAME_MAX }),
    baseUrl: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    apiKey: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    model: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    customPrompt: Type.Union([Type.String({ maxLength: PROVIDER_CONFIG_PROMPT_MAX }), Type.Null()])
  })
);
export type ProviderConfigPatch = Static<typeof ProviderConfigPatchSchema>;

import { Type, type Static } from '@sinclair/typebox';

export type ApiErrorCode =
  | 'not_found'
  | 'validation_failed'
  | 'generation_in_progress'
  | 'no_active_generation'
  | 'message_has_children'
  | 'invalid_parent'
  | 'not_assistant_message'
  | 'not_leaf'
  | 'provider_unconfigured'
  | 'prompt_budget_exceeded'
  | 'serialize_failed'
  | 'chat_has_active_generation'
  | 'chat_references'
  | 'character_in_use'
  | 'stale_write'
  | 'slug_taken'
  | 'asset_type_rejected'
  | 'asset_too_large'
  | 'asset_dimensions'
  | 'asset_quota'
  | 'persona_is_default'
  | 'persona_in_use'
  | 'forbidden'
  | 'auth_required'
  | 'invalid_pin'
  | 'too_many_requests'
  | 'internal';

export const ApiErrorCodeSchema = Type.Union([
  Type.Literal('not_found'),
  Type.Literal('validation_failed'),
  Type.Literal('generation_in_progress'),
  Type.Literal('no_active_generation'),
  Type.Literal('message_has_children'),
  Type.Literal('invalid_parent'),
  Type.Literal('not_assistant_message'),
  Type.Literal('not_leaf'),
  Type.Literal('provider_unconfigured'),
  Type.Literal('prompt_budget_exceeded'),
  Type.Literal('serialize_failed'),
  Type.Literal('chat_has_active_generation'),
  Type.Literal('chat_references'),
  Type.Literal('character_in_use'),
  Type.Literal('stale_write'),
  Type.Literal('slug_taken'),
  Type.Literal('asset_type_rejected'),
  Type.Literal('asset_too_large'),
  Type.Literal('asset_dimensions'),
  Type.Literal('asset_quota'),
  Type.Literal('persona_is_default'),
  Type.Literal('persona_in_use'),
  Type.Literal('forbidden'),
  Type.Literal('auth_required'),
  Type.Literal('invalid_pin'),
  Type.Literal('too_many_requests'),
  Type.Literal('internal')
]);

export const ApiErrorSchema = Type.Object({
  error: Type.Object({
    code: ApiErrorCodeSchema,
    message: Type.String(),
    details: Type.Optional(Type.Unknown())
  })
});
export type ApiErrorResponse = Static<typeof ApiErrorSchema>;

export const AuthVerifyRequestSchema = Type.Object({
  pin: Type.String({ minLength: 1, maxLength: 64 })
});
export type AuthVerifyRequest = Static<typeof AuthVerifyRequestSchema>;

export const AuthStatusResponseSchema = Type.Object({
  authRequired: Type.Union([Type.Literal('pin'), Type.Literal('none')])
});
export type AuthStatusResponse = Static<typeof AuthStatusResponseSchema>;

export const AuthVerifyResponseSchema = Type.Object({
  token: Type.String({ minLength: 16 })
});
export type AuthVerifyResponse = Static<typeof AuthVerifyResponseSchema>;

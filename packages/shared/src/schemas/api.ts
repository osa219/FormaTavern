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

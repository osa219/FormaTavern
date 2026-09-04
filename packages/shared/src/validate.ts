import { Value } from '@sinclair/typebox/value';
import type { Static, TSchema } from '@sinclair/typebox';

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

/** Pipeline: Clone → Clean (strip unknown keys) → Default (apply schema defaults) → Check. Never mutates input. */
export function validate<S extends TSchema>(schema: S, input: unknown): ValidationResult<Static<S>> {
  const value = Value.Default(schema, Value.Clean(schema, Value.Clone(input)));
  if (Value.Check(schema, value)) return { ok: true, value: value as Static<S> };
  return {
    ok: false,
    issues: [...Value.Errors(schema, value)].map((e) => ({ path: e.path, message: e.message }))
  };
}

export class ValidationError extends Error {
  constructor(
    public readonly label: string,
    public readonly issues: ValidationIssue[]
  ) {
    super(`${label}: ${issues.map((i) => `${i.path || '/'} ${i.message}`).join('; ')}`);
    this.name = 'ValidationError';
  }
}

export function assertValid<S extends TSchema>(schema: S, input: unknown, label: string): Static<S> {
  const r = validate(schema, input);
  if (!r.ok) throw new ValidationError(label, r.issues);
  return r.value;
}

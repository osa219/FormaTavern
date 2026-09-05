import { treaty } from '@elysiajs/eden';
import type { App } from '@formatavern/backend';
import { errorToCopy, type UiError } from './errors';

export const api = treaty<App>(typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3000');

export function toUiError(err: any): UiError {
  if (!err) {
    return { code: 'unknown', message: 'An unknown error occurred' };
  }

  // Handle Eden Treaty error structure: { status, value: { error } }
  if (err.value?.error) {
    const serverErr = err.value.error;
    const code =
      serverErr.code ??
      (err.status === 409
        ? 'generation_in_progress'
        : err.status === 404
          ? 'not_found'
          : err.status === 413
            ? 'prompt_budget_exceeded'
            : 'bad_request');
    const message = errorToCopy(code, serverErr.message);
    return { code, message, details: serverErr.details };
  }

  if (err.error && typeof err.error === 'object') {
    const code = err.error.code ?? 'error';
    const message = errorToCopy(code, err.error.message);
    return { code, message, details: err.error.details };
  }

  const code = err.code ?? (err.name === 'AbortError' ? 'aborted' : 'network_error');
  const message = errorToCopy(code, err.message ?? 'Request failed');
  return { code, message, details: err.details };
}

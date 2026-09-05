export interface UiError {
  code: string;
  message: string;
  details?: unknown;
}

export const ERROR_COPY: Record<string, string> = {
  generation_in_progress: 'A generation is already in progress — stop first or wait for completion.',
  provider_unconfigured: 'Provider is not configured. Please configure an API key in Settings.',
  prompt_budget_exceeded: 'Context budget exceeded. Consider adjusting context length or max tokens.',
  not_found: 'The requested resource was not found.',
  bad_request: 'Invalid request or invalid parameter provided.',
  internal_error: 'An unexpected server error occurred.',
  network_error: 'Unable to reach the server. Please check your connection.'
};

export function errorToCopy(code: string, fallbackMessage?: string): string {
  return ERROR_COPY[code] ?? fallbackMessage ?? 'An unexpected error occurred.';
}

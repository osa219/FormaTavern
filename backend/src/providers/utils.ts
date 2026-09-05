import type { MessagePayload, AbortSignalLike } from '@formatavern/shared';

/**
 * Merges consecutive messages with the same role into a single message joined by '\n\n'.
 */
export function coalesceConsecutiveRoles(messages: MessagePayload[]): MessagePayload[] {
  if (messages.length === 0) return [];

  const result: MessagePayload[] = [];
  let current = { ...messages[0] };

  for (let i = 1; i < messages.length; i++) {
    const next = messages[i];
    if (next.role === current.role) {
      current.content += '\n\n' + next.content;
    } else {
      result.push(current);
      current = { ...next };
    }
  }

  result.push(current);
  return result;
}

/**
 * Ensures that the first non-system message is a user message.
 * If the first non-system message is 'assistant', prepends { role: 'user', content: '[Scene begins.]' }.
 */
export function ensureUserFirst(messages: MessagePayload[]): MessagePayload[] {
  if (messages.length === 0) {
    return [{ role: 'user', content: '[Scene begins.]' }];
  }

  const firstNonSystemIndex = messages.findIndex((m) => m.role !== 'system');
  if (firstNonSystemIndex === -1) {
    // Only system messages exist
    return [...messages, { role: 'user', content: '[Scene begins.]' }];
  }

  if (messages[firstNonSystemIndex].role === 'assistant') {
    const copy = [...messages];
    copy.splice(firstNonSystemIndex, 0, { role: 'user', content: '[Scene begins.]' });
    return copy;
  }

  return messages;
}

/**
 * Sleeps for ms milliseconds, or resolves immediately if the abort signal fires.
 */
export function abortableSleep(ms: number, signal?: AbortSignalLike): Promise<void> {
  if (signal?.aborted || ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onAbort = () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };

    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

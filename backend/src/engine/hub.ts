import type { ChatStreamEvent } from '@formatavern/shared';
import type { Active, GenerationHub } from './contracts';
import { ApiError } from './errors';

interface ActiveEntry extends Active {
  controller: AbortController;
  updateSnapshot(text: string): void;
}

export class GenerationHubImpl implements GenerationHub {
  private byMessageId = new Map<string, ActiveEntry>();
  private byChatId = new Map<string, ActiveEntry>();
  private subscribersByMessageId = new Map<string, Set<(ev: ChatStreamEvent) => void>>();
  private onCloseCallbacks = new Set<() => void>();

  activeForChat(chatId: string): Active | null {
    const entry = this.byChatId.get(chatId);
    if (!entry || entry.controller.signal.aborted) {
      return null;
    }
    return this.toActive(entry);
  }

  activeCount(): number {
    let count = 0;
    for (const entry of this.byMessageId.values()) {
      if (!entry.controller.signal.aborted) {
        count++;
      }
    }
    return count;
  }

  get(messageId: string): Active | null {
    const entry = this.byMessageId.get(messageId);
    if (!entry || entry.controller.signal.aborted) {
      return null;
    }
    return this.toActive(entry);
  }

  register(input: { messageId: string; chatId: string }): {
    controller: AbortController;
    emit(ev: ChatStreamEvent): void;
    updateSnapshot(text: string): void;
    close(): void;
  } {
    const existingChat = this.byChatId.get(input.chatId);
    if (existingChat && !existingChat.controller.signal.aborted) {
      throw new ApiError('generation_in_progress', 409, 'Generation already in progress for this chat');
    }
    const existingMsg = this.byMessageId.get(input.messageId);
    if (existingMsg && !existingMsg.controller.signal.aborted) {
      throw new ApiError('generation_in_progress', 409, 'Generation already in progress for this message');
    }

    const controller = new AbortController();
    let currentBuffer = '';

    let subscribers = this.subscribersByMessageId.get(input.messageId);
    if (!subscribers) {
      subscribers = new Set();
      this.subscribersByMessageId.set(input.messageId, subscribers);
    }

    const entry: ActiveEntry = {
      messageId: input.messageId,
      chatId: input.chatId,
      startedAt: Date.now(),
      controller,
      snapshot(): string {
        return currentBuffer;
      },
      updateSnapshot(text: string): void {
        currentBuffer = text;
      }
    };

    this.byMessageId.set(input.messageId, entry);
    this.byChatId.set(input.chatId, entry);

    const emit = (ev: ChatStreamEvent): void => {
      const currentSubs = this.subscribersByMessageId.get(input.messageId);
      if (currentSubs) {
        const subsArray = Array.from(currentSubs);
        for (const subscriber of subsArray) {
          try {
            subscriber(ev);
          } catch {
            // Subscriber delivery error does not break generation engine
          }
        }
      }
    };

    const updateSnapshot = (text: string): void => {
      entry.updateSnapshot(text);
    };

    const close = (): void => {
      this.byMessageId.delete(input.messageId);
      this.byChatId.delete(input.chatId);
      this.subscribersByMessageId.delete(input.messageId);
      for (const cb of this.onCloseCallbacks) {
        try {
          cb();
        } catch {
          // ignore
        }
      }
    };

    return {
      controller,
      emit,
      updateSnapshot,
      close
    };
  }

  subscribe(messageId: string, cb: (ev: ChatStreamEvent) => void): () => void {
    let subs = this.subscribersByMessageId.get(messageId);
    if (!subs) {
      subs = new Set();
      this.subscribersByMessageId.set(messageId, subs);
    }
    subs.add(cb);
    return () => {
      subs?.delete(cb);
      if (subs?.size === 0 && !this.byMessageId.has(messageId)) {
        this.subscribersByMessageId.delete(messageId);
      }
    };
  }

  abort(messageId: string, reason: 'user' | 'agency' | 'shutdown'): boolean {
    const entry = this.byMessageId.get(messageId);
    if (!entry) {
      return false;
    }
    entry.controller.abort(reason);
    return true;
  }

  async abortAll(reason: 'shutdown'): Promise<void> {
    if (this.byMessageId.size === 0) {
      return;
    }

    for (const entry of Array.from(this.byMessageId.values())) {
      entry.controller.abort(reason);
    }

    if (this.byMessageId.size === 0) {
      return;
    }

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.onCloseCallbacks.delete(checkDone);
        resolve();
      }, 2000);

      const checkDone = () => {
        if (this.byMessageId.size === 0) {
          clearTimeout(timer);
          this.onCloseCallbacks.delete(checkDone);
          resolve();
        }
      };

      this.onCloseCallbacks.add(checkDone);
    });
  }

  private toActive(entry: ActiveEntry): Active {
    return {
      messageId: entry.messageId,
      chatId: entry.chatId,
      startedAt: entry.startedAt,
      snapshot: () => entry.snapshot()
    };
  }
}

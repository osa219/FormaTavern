import type { ChatStreamEvent } from '@formatavern/shared';
import type { MessageRepository } from '../db/contracts';
import type { GenerationHub } from '../engine/contracts';
import { ApiError } from '../engine/errors';

export function frame(ev: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(ev)}\n\n`);
}

export function sseResponse(
  hub: GenerationHub,
  messageId: string,
  options?: {
    isReattach?: boolean;
    messagesRepo?: MessageRepository;
  }
): Response {
  let unsub: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const active = hub.get(messageId);

      if (options?.isReattach) {
        if (active) {
          const snap = active.snapshot();
          controller.enqueue(
            frame({
              type: 'start',
              messageId,
              chatId: active.chatId,
              parentId: null,
              resumedFrom: snap.length
            })
          );
          if (snap.length > 0) {
            controller.enqueue(frame({ type: 'token', text: snap }));
          }

          unsub = hub.subscribe(messageId, (ev) => {
            try {
              controller.enqueue(frame(ev));
              if (ev.type === 'done' || ev.type === 'error') {
                controller.close();
              }
            } catch {
              // client closed
            }
          });
        } else {
          // Replay completed message if available
          if (!options.messagesRepo) {
            throw new ApiError('not_found', 404, `Message ${messageId} not found`);
          }
          const msg = options.messagesRepo.get(messageId);
          if (!msg) {
            throw new ApiError('not_found', 404, `Message ${messageId} not found`);
          }

          controller.enqueue(
            frame({
              type: 'start',
              messageId,
              chatId: msg.chatId,
              parentId: msg.parentId,
              resumedFrom: 0
            })
          );
          if (msg.content.length > 0) {
            controller.enqueue(frame({ type: 'token', text: msg.content }));
          }
          controller.enqueue(frame({ type: 'done', message: msg }));
          controller.close();
        }
      } else {
        // Normal generation subscriber (subscribed before runGeneration is invoked)
        unsub = hub.subscribe(messageId, (ev) => {
          try {
            controller.enqueue(frame(ev));
            if (ev.type === 'done' || ev.type === 'error') {
              controller.close();
            }
          } catch {
            // client disconnected
          }
        });
      }
    },
    cancel() {
      if (unsub) {
        unsub();
        unsub = null;
      }
      // Invariant S1: Never call hub.abort() on client disconnect
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}

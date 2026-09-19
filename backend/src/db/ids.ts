import { randomInt } from 'node:crypto';
import { monotonicFactory } from 'ulid';

const monotonicUlid = monotonicFactory();

export function newId(): string {
  return monotonicUlid();
}

/** Bitcoin Base58 without confusables (no 0, O, I, l). */
const CHAT_ID_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CHAT_ID_LENGTH = 8;

/**
 * Short crypto-random chat IDs (e.g. `7Kp3mQ9x`).
 * Chats-only: messages, assets, and personas keep ULIDs, since message
 * pagination and branch ordering rely on monotonic ULID order.
 * 58^8 (~1.3e14) leaves collisions to the unique-constraint retry
 * at the single creation call site.
 */
export function newChatId(): string {
  let id = '';
  for (let i = 0; i < CHAT_ID_LENGTH; i++) {
    id += CHAT_ID_ALPHABET[randomInt(CHAT_ID_ALPHABET.length)];
  }
  return id;
}

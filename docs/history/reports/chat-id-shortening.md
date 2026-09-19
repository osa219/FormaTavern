# Chat ID Shortening — Decision Record

Small UX improvement: chat URLs went from 26-char ULIDs
(`/chat/01M2TMC4X5A4TF8W69W5EXRCJZ`) to 8-char random IDs
(`/chat/7Kp3mQ9x`).

## Context

Chat IDs were monotonic ULIDs, shared with messages, assets, and personas
via a single `newId()` generator. The full ULID surfaced in the address bar,
where its length served no user purpose. JanitorAI's short numeric chat
routing (`/chats/2964518274`) was the existence proof that short IDs work at
scale — not a template to copy.

## Decision

- New chats get an **8-char, crypto-random, Base58** ID
  (`123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz` —
  no `0`/`O`/`I`/`l`).
- **Chats-only.** Messages, assets, and personas keep ULIDs: message
  pagination, sibling decoration, and branch-path queries rely on monotonic
  ULID ordering.
- **Random, not sequential.** Sequential IDs leak chat count and creation
  rate, are trivially enumerable, and need counter infrastructure that breaks
  offline creation and DB import/export. Random needs none of that.
- **No migration.** Legacy ULID chat rows still resolve; only new chats get
  short IDs.

## Capacity

58^8 ≈ 1.3e14 (~47 bits). Brute force at 10k guesses/sec takes ~400 years;
at local scale collisions effectively never occur. Creation retries up to
5 times on conflict before surfacing an error.

## Changes (commit `cb562ce`)

- `backend/src/db/ids.ts` — new `newChatId()` generator.
- `backend/src/routes/chats.ts` — chat creation uses `newChatId()` with
  collision retry; message IDs unchanged.
- `backend/test/routes/chats.test.ts` — asserts Base58 format, uniqueness
  across 10 creations, and ULID greeting messages.
- `docs/schema.md` — chats `id` column comment updated.

## Verification

- New `chats.test.ts` case passes; full backend suite 351 pass / 0 fail;
  `tsc` clean. Manually confirmed in `dev:lan`: new stories open at
  `/chat/<8 chars>`, pre-existing ULID chats still open.

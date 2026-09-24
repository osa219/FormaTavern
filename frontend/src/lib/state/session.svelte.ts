import {
  defaultState,
  isEmptyOutputError,
  type CharacterCard,
  type ChatStreamEvent,
  type ChatView,
  type MessageWithTree,
  type NarrativeRole,
  type ParseWarningCode,
  type Persona,
  type Segment,
  type StateVector
} from '@formatavern/shared';
import { api, readSse as defaultReadSse, toUiError } from '../api';
import { toasts } from './toasts.svelte';
import { prefs } from './prefs.svelte';
import { StreamController } from './stream.svelte';
import { seedMissingHashes, resolveMediaHashes } from '../render/mediaRewrite';
import { extractMediaHashes } from '@formatavern/shared';

function hydrateMessageMedia(messages: MessageWithTree[]): void {
  const allHashes: string[] = [];
  for (const m of messages) {
    if (m.missingAssets) {
      try {
        const parsed = JSON.parse(m.missingAssets);
        if (Array.isArray(parsed)) seedMissingHashes(parsed);
      } catch {}
    }
    if (m.content) {
      allHashes.push(...extractMediaHashes(m.content));
    }
  }
  if (allHashes.length > 0) {
    void resolveMediaHashes(allHashes);
  }
}

export interface LiveTurn {
  messageId: string | null;
  parentId: string | null;
  optimisticUserId: string | null;
  segments: Segment[];
  heldBack: string;
  warnings: ParseWarningCode[];
  truncatedAt: 'persona' | null;
  chars: number;
  startedAt: number;
  ttftMs: number | null;
  phase: 'connecting' | 'streaming' | 'finishing';
  resumedFrom: number;
  reasoning?: string | null;
  isThinking?: boolean;
}

export interface SessionDeps {
  readSse?: typeof defaultReadSse;
  fetch?: typeof fetch;
}

export const WINDOW_SIZE = 60;
export const WINDOW_MAX = 240;

export class ChatSession {
  readonly chatId: string;
  chat = $state<ChatView>();
  character = $state<CharacterCard>();
  persona = $state<Persona | null>(null);
  messages = $state.raw<MessageWithTree[]>([]);
  // Rows currently being discarded: hidden from every render (including
  // refetches racing with the delete sequence) until the discard settles.
  discarding = $state.raw<readonly string[]>([]);
  hasOlder = $state<boolean>(true);
  loadingOlder = $state<boolean>(false);
  live = $state<LiveTurn | null>(null);

  // Hook called after each frame commit (used by ScrollController)
  onStreamCommit?: () => void;

  currentState = $derived.by(() => this.chat?.metadata.currentState ?? (this.character ? defaultState(this.character) : {}));
  activeLeafId = $derived.by(() => this.chat?.activeLeafId ?? null);
  busy = $derived.by(() => this.live !== null);
  themeInputs = $derived.by(() => ({
    character: this.character,
    persona: this.persona ?? undefined,
    state: this.currentState
  }));

  private abortController: AbortController | null = null;
  private streamController: StreamController | null = null;
  private readSseFn: typeof defaultReadSse;
  private fetchFn: typeof fetch;

  constructor(
    initial: {
      chat: ChatView;
      character?: CharacterCard;
      persona?: Persona | null;
      messages?: MessageWithTree[];
      hasOlder?: boolean;
    },
    deps?: SessionDeps
  ) {
    this.chatId = initial.chat.id;
    this.chat = initial.chat;
    this.character = initial.character;
    this.persona = initial.persona ?? null;
    this.messages = initial.messages ?? [];
    if (typeof initial.hasOlder === 'boolean') {
      this.hasOlder = initial.hasOlder;
    }
    this.readSseFn = deps?.readSse ?? defaultReadSse;
    this.fetchFn = deps?.fetch ?? fetch;

    if (this.chat.activeGenerationMessageId) {
      this.reattach();
    }
    if (this.messages.length > 0) {
      hydrateMessageMedia(this.messages);
    }
  }

  async loadOlder(): Promise<{ beforeHeight: number } | void> {
    if (this.loadingOlder || !this.hasOlder || this.messages.length === 0) return;
    this.loadingOlder = true;
    try {
      const oldestId = this.messages[0].id;
      const { data, error } = await api.api.chats({ id: this.chatId }).messages.get({
        query: { limit: WINDOW_SIZE, before: oldestId }
      });

      if (!error && Array.isArray(data)) {
        if (data.length < WINDOW_SIZE) {
          this.hasOlder = false;
        }
        if (data.length > 0) {
          const older = data as MessageWithTree[];
          this.messages = [...older, ...this.messages];
          hydrateMessageMedia(older);
        }
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    } finally {
      this.loadingOlder = false;
    }
  }

  async send(input: {
    message?: string;
    directorNote?: string;
    narrativeRole?: NarrativeRole;
    senderName?: string;
  }): Promise<void> {
    if (this.busy) {
      toasts.error('A turn is already generating — stop first.');
      return;
    }

    const optimisticId = `tmp-${Date.now()}`;
    const userRole = input.narrativeRole ?? 'persona';
    const userContent = input.message ?? '';

    // Push optimistic user turn synchronously (Invariant U7)
    const optimisticTurn: MessageWithTree = {
      id: optimisticId,
      chatId: this.chatId,
      parentId: this.activeLeafId,
      senderId: this.persona?.id ?? 'traveler',
      role: userRole === 'persona' ? 'user' : 'assistant',
      narrativeRole: userRole,
      senderName: input.senderName ?? (userRole === 'persona' ? this.persona?.name ?? 'Traveler' : null),
      content: userContent,
      segments: userContent ? [{ kind: userRole === 'narrator' ? 'narrator' : userRole === 'npc' ? 'npc' : 'persona', name: input.senderName, text: userContent }] : [],
      status: 'complete',
      createdAt: Date.now(),
      siblingIndex: 0,
      siblingCount: 1,
      hasChildren: false,
      state: null,
      metadata: input.directorNote ? { directorNote: input.directorNote } : {},
      metrics: null
    };

    this.messages = [...this.messages, optimisticTurn];

    this.live = {
      messageId: null,
      parentId: optimisticId,
      optimisticUserId: optimisticId,
      segments: [],
      heldBack: '',
      warnings: [],
      truncatedAt: null,
      chars: 0,
      startedAt: Date.now(),
      ttftMs: null,
      phase: 'connecting',
      resumedFrom: 0
    };

    this.initStreamController();
    this.abortController = new AbortController();

    try {
      await this.readSseFn(
        `/api/chats/${this.chatId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: input.message || undefined,
            directorNote: input.directorNote || undefined,
            narrativeRole: input.narrativeRole,
            senderName: input.senderName,
            generate: true
          })
        },
        (ev) => this.handleStreamEvent(ev),
        this.abortController.signal
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      // Non-2xx before start or connection failure: rollback optimistic turn
      this.messages = this.messages.filter((m) => m.id !== optimisticId);
      this.live = null;
      toasts.error(toUiError(err).message);
    }
  }

  async stop(): Promise<void> {
    const targetId = this.live?.messageId ?? this.chat?.activeGenerationMessageId;
    if (!targetId) return;

    try {
      await api.api.messages({ id: targetId }).stop.post();
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  async regenerate(messageId: string): Promise<void> {
    if (this.busy) return;

    this.live = {
      messageId: null,
      parentId: null,
      optimisticUserId: null,
      segments: [],
      heldBack: '',
      warnings: [],
      truncatedAt: null,
      chars: 0,
      startedAt: Date.now(),
      ttftMs: null,
      phase: 'connecting',
      resumedFrom: 0
    };

    this.initStreamController();
    this.abortController = new AbortController();

    try {
      await this.readSseFn(
        `/api/messages/${messageId}/regenerate`,
        { method: 'POST' },
        (ev) => this.handleStreamEvent(ev),
        this.abortController.signal
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.live = null;
      toasts.error(toUiError(err).message);
    }
  }

  async retryForUser(userMessageId: string): Promise<void> {
    if (this.busy) return;

    this.live = {
      messageId: null,
      parentId: null,
      optimisticUserId: null,
      segments: [],
      heldBack: '',
      warnings: [],
      truncatedAt: null,
      chars: 0,
      startedAt: Date.now(),
      ttftMs: null,
      phase: 'connecting',
      resumedFrom: 0
    };

    this.initStreamController();
    this.abortController = new AbortController();

    try {
      await this.readSseFn(
        `/api/messages/${userMessageId}/retry-response`,
        { method: 'POST' },
        (ev) => this.handleStreamEvent(ev),
        this.abortController.signal
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.live = null;
      toasts.error(toUiError(err).message);
    }
  }

  async continueTurn(messageId: string): Promise<void> {
    if (this.busy) return;

    const existingMsg = this.messages.find((m) => m.id === messageId);
    const existingContent = existingMsg?.content ?? '';

    this.live = {
      messageId,
      parentId: existingMsg?.parentId ?? null,
      optimisticUserId: null,
      segments: existingMsg?.segments ? [...existingMsg.segments] : [],
      heldBack: '',
      warnings: [],
      truncatedAt: null,
      chars: existingContent.length,
      startedAt: Date.now(),
      ttftMs: null,
      phase: 'connecting',
      resumedFrom: existingContent.length
    };

    this.initStreamController();
    if (existingContent) {
      this.streamController?.seed(existingContent);
    }

    this.abortController = new AbortController();

    try {
      await this.readSseFn(
        `/api/messages/${messageId}/continue`,
        { method: 'POST' },
        (ev) => this.handleStreamEvent(ev),
        this.abortController.signal
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.live = null;
      toasts.error(toUiError(err).message);
    }
  }

  /**
   * Deletes a debris row (aborted-empty or empty-output) and repoints the
   * leaf. Delete alone would land on the parent user turn and strand any
   * valid siblings, so when remaining siblings exist the newest complete one
   * becomes the leaf instead — a failed swipe page simply never happened.
   * Returns true when falling back to a sibling, false when landing on the
   * parent (user turn offers retry there).
   */
  private async discardDebris(finishedId: string): Promise<boolean> {
    // Hide the debris row for the whole discard: the `start`-triggered
    // refetch can land after the backend finalized the error but before the
    // delete below completes, flashing its banner for a frame. Filtering in
    // refetchState (not just a one-time splice) covers refetches landing at
    // any point mid-sequence. Sibling lookup is server-side, unaffected.
    if (!this.discarding.includes(finishedId)) {
      this.discarding = [...this.discarding, finishedId];
    }
    this.messages = this.messages.filter((m) => m.id !== finishedId);
    let fallbackId: string | null = null;
    try {
      const { data } = await api.api.messages({ id: finishedId }).siblings.get();
      if (Array.isArray(data)) {
        const remaining = (data as MessageWithTree[]).filter((m) => m.id !== finishedId);
        const complete = remaining.filter((m) => m.status === 'complete');
        const pool = complete.length > 0 ? complete : remaining;
        pool.sort((a, b) => b.siblingIndex - a.siblingIndex);
        fallbackId = pool[0]?.id ?? null;
      }
    } catch {
      // ignore — fall through to plain delete + refetch
    }
    try {
      await api.api.messages({ id: finishedId }).delete();
    } catch {
      // ignore — refetch/select below shows whatever survived
    }
    // Unmark before the final navigation so it renders the truth: the row
    // is gone server-side on success, or reappears if the delete failed.
    this.discarding = this.discarding.filter((id) => id !== finishedId);
    if (fallbackId) {
      await this.select(fallbackId);
      return true;
    }
    await this.refetchState();
    return false;
  }

  async select(siblingId: string): Promise<void> {
    try {
      const { error } = await api.api.messages({ id: siblingId }).select.post();
      if (error) {
        toasts.error(toUiError(error).message);
        return;
      }
      await this.refetchState();
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  async edit(messageId: string, content: string): Promise<void> {
    try {
      const { error } = await api.api.messages({ id: messageId }).patch({ content });
      if (error) {
        toasts.error(toUiError(error).message);
        return;
      }
      await this.refetchState();
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  async editSegments(messageId: string, segments: Segment[]): Promise<void> {
    try {
      // Eden narrows the MessagePatch union body (kind: never); the backend
      // runtime-validates via MessagePatchSchema, covered by tree-lifecycle tests.
      const { error } = await api.api.messages({ id: messageId }).patch({ segments } as any);
      if (error) {
        toasts.error(toUiError(error).message);
        return;
      }
      await this.refetchState();
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  async remove(messageId: string): Promise<void> {
    try {
      const { error } = await api.api.messages({ id: messageId }).delete();
      if (error) {
        toasts.error(toUiError(error).message);
        return;
      }
      await this.refetchState();
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  async overrideState(patch: StateVector): Promise<void> {
    try {
      const res = await this.fetchFn(`/api/chats/${this.chatId}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: patch })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.warnings?.length) {
          toasts.show(`State updated with warnings: ${data.warnings.join(', ')}`, 'info');
        }
        await this.refetchState();
      } else {
        toasts.error(data?.error?.message ?? 'Failed to apply state override');
      }
    } catch (err: any) {
      toasts.error(toUiError(err).message);
    }
  }

  async reattach(): Promise<void> {
    const targetId = this.chat?.activeGenerationMessageId;
    if (!targetId || this.busy) return;

    this.live = {
      messageId: targetId,
      parentId: null,
      optimisticUserId: null,
      segments: [],
      heldBack: '',
      warnings: [],
      truncatedAt: null,
      chars: 0,
      startedAt: Date.now(),
      ttftMs: null,
      phase: 'streaming',
      resumedFrom: 0
    };

    this.initStreamController();
    this.abortController = new AbortController();

    try {
      await this.readSseFn(
        `/api/messages/${targetId}/stream`,
        { method: 'GET' },
        (ev) => this.handleStreamEvent(ev),
        this.abortController.signal
      );
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      this.live = null;
      toasts.error(toUiError(err).message);
    }
  }

  destroy(): void {
    // Abort reader ONLY — generation continues on backend (Invariant S1, U9)
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.streamController) {
      this.streamController.dispose();
      this.streamController = null;
    }
  }

  private initStreamController() {
    this.streamController?.dispose();
    this.streamController = new StreamController(
      () => ({
        primaryCharacter: this.character?.name ?? 'Character',
        dialect: this.chat?.metadata.envelopeDialect ?? 'directive',
        npcs: this.chat?.metadata.npcs ? Object.keys(this.chat.metadata.npcs) : []
      }),
      (r, chars, liveReasoning) => {
        if (this.live) {
          this.live.segments = r.segments;
          this.live.heldBack = r.heldBack;
          this.live.warnings = r.warnings.map((w) => w.code);
          this.live.truncatedAt = r.truncatedAt;
          this.live.chars = chars;
          this.live.reasoning = liveReasoning?.reasoning ?? null;
          this.live.isThinking = liveReasoning?.isThinking ?? false;
          if (this.live.ttftMs === null) {
            this.live.ttftMs = Date.now() - this.live.startedAt;
          }
          this.onStreamCommit?.();
        }
      }
    );
  }

  private async handleStreamEvent(ev: ChatStreamEvent): Promise<void> {
    if (ev.type === 'start') {
      if (this.live) {
        this.live.messageId = ev.messageId;
        this.live.parentId = ev.parentId;
        this.live.phase = 'streaming';
        if (ev.resumedFrom) {
          this.live.resumedFrom = ev.resumedFrom;
        }
      }
      // Open the new page up front: the streaming row already exists
      // server-side (and the leaf already points at it), so pull it into
      // the log and stream into it instead of appending underneath.
      void this.refetchState();
    } else if (ev.type === 'token') {
      this.streamController?.push(ev.text);
    } else if (ev.type === 'done') {
      this.streamController?.flush();
      const finishedId = ev.message.id;
      const abortedEmpty =
        ev.message.status === 'aborted' &&
        ev.message.content.trim().length === 0 &&
        ev.message.segments.length === 0;
      // Any error row with zero segments (network failure, thinking-only,
      // state-only, blank) carries nothing renderable: the banner + Retry
      // would duplicate the pager arrow + toast. Discard it so the failed
      // page never happened; errors WITH partial segments are always kept
      // (Continue needs them).
      const emptyError =
        ev.message.status === 'error' &&
        ev.message.segments.length === 0 &&
        !prefs.keepEmptyReplies;
      this.live = null;
      if (abortedEmpty) {
        // Stopped while still in thinking: debris row, drop it. A failed
        // swipe page vanishes and the previous valid sibling becomes the
        // leaf again; with no siblings the user turn offers retry.
        await this.discardDebris(finishedId);
      } else if (emptyError) {
        const fellBack = await this.discardDebris(finishedId);
        const reason = isEmptyOutputError(ev.message.metadata)
          ? 'Model returned no story output'
          : `Generation failed (${ev.message.metadata?.error?.message ?? 'unknown error'})`;
        toasts.error(
          fellBack ? `${reason} — back to the previous response.` : `${reason} — turn discarded. Retry from your message.`
        );
      } else if (this.messages.length === 0 || this.messages[this.messages.length - 1].id !== finishedId) {
        // Peeked away mid-stream (or missed the start refetch): arrival
        // lands on the new page instead of stranding the view elsewhere.
        await this.select(finishedId);
      } else {
        await this.refetchState();
      }
    } else if (ev.type === 'error') {
      this.streamController?.flush();
      this.live = null;
      if (ev.message.status === 'error' && ev.message.segments.length === 0 && !prefs.keepEmptyReplies) {
        const fellBack = await this.discardDebris(ev.message.id);
        const reason = isEmptyOutputError(ev.message.metadata)
          ? 'Model returned no story output'
          : `Generation failed (${ev.error.message})`;
        toasts.error(
          fellBack ? `${reason} — back to the previous response.` : `${reason} — turn discarded. Retry from your message.`
        );
      } else {
        toasts.error(ev.error.message);
        this.refetchState();
      }
    }
  }

  async refetchState(): Promise<void> {
    try {
      const [chatRes, msgsRes] = await Promise.all([
        api.api.chats({ id: this.chatId }).get(),
        api.api.chats({ id: this.chatId }).messages.get({ query: { limit: WINDOW_SIZE } })
      ]);

      if (!chatRes.error && chatRes.data && 'id' in chatRes.data) {
        this.chat = chatRes.data as ChatView;
      }
      if (!msgsRes.error && Array.isArray(msgsRes.data)) {
        const hidden = this.discarding;
        this.messages =
          hidden.length === 0
            ? (msgsRes.data as MessageWithTree[])
            : (msgsRes.data as MessageWithTree[]).filter((m) => !hidden.includes(m.id));
        hydrateMessageMedia(this.messages);
      }
    } catch {
      // ignore
    }
  }
}

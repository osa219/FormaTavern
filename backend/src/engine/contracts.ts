import type {
  ChatStreamEvent,
  LLMProvider,
  LLMRequest,
  ParseOptions,
  StateVector,
  StateField
} from '@formatavern/shared';

export interface Active {
  messageId: string;
  chatId: string;
  startedAt: number;
  snapshot(): string;
  updateBuffer?(text: string): void;
}

export interface GenerationHub {
  activeForChat(chatId: string): Active | null;
  get(messageId: string): Active | null;
  register(input: { messageId: string; chatId: string }): {
    controller: AbortController;
    emit(ev: ChatStreamEvent): void;
    updateSnapshot(text: string): void;
    close(): void;
  };
  subscribe(messageId: string, cb: (ev: ChatStreamEvent) => void): () => void;
  abort(messageId: string, reason: 'user' | 'agency' | 'shutdown'): boolean;
  abortAll(reason: 'shutdown'): Promise<void>;
  activeCount?(): number;
}

export interface ProviderResolution {
  provider: LLMProvider;
  model: string;
  contextLength: number;
}

export interface ProviderRegistry {
  resolve(settings: {
    provider?: { id?: 'mock' | 'openrouter' | 'custom' | 'gemini' | 'gemini-interactions'; model?: string };
    openrouter?: { apiKey?: string };
    custom?: { baseUrl?: string; apiKey?: string };
    gemini?: { apiKey?: string };
    generation?: { contextLength?: number };
  }): ProviderResolution;
}

export interface GenerationJob {
  chatId: string;
  assistantId: string;
  parentId: string | null;
  userMessageId?: string;
  provider: LLMProvider;
  model: string;
  request: LLMRequest;
  promptTokensEstimated: number;
  droppedTurns: number;
  parseOptions: ParseOptions;
  previousState: StateVector;
  stateSchema?: Record<string, StateField>;
  resume?: { content: string };
  flushIntervalMs?: number;
}

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string; recoverable: boolean }
  | { type: 'done'; finishReason: 'stop' | 'length' | 'aborted' };

export interface MessagePayload {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  model?: string;
  systemPrompt?: string;
  history: MessagePayload[];
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  repetitionPenalty?: number;
  frequencyPenalty?: number;
  reasoning?: 'on' | 'off';
  reasoningEffort?: 'low' | 'medium' | 'high';
  stop?: string[];
  maxTokens?: number;
  assistantPrefill?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  // Provider-reported context window. Null when the provider does not
  // report one: callers must fall back to the manual setting, never to a
  // made-up number (a fake 8192 would wrongly clamp larger windows).
  contextLength: number | null;
}

export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: 'abort', cb: () => void, opts?: { once?: boolean }): void;
  removeEventListener(type: 'abort', cb: () => void): void;
}
export type AbortSignal = AbortSignalLike;

export interface LLMProvider {
  id: string;
  capabilities: {
    chatCompletion: boolean;
    textCompletion: boolean;
    listModels: boolean;
    prefill: boolean;
    nativeStateChannel: boolean;
  };
  listModels?(): Promise<ModelInfo[]>;
  generate(req: LLMRequest, signal?: AbortSignalLike): AsyncIterable<StreamEvent>;
}

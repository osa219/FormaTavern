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
  stop?: string[];
  maxTokens?: number;
  assistantPrefill?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
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

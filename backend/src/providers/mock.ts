import {
  type LLMProvider,
  type LLMRequest,
  type ModelInfo,
  type StreamEvent,
  type AbortSignalLike,
  ENVELOPE_SCRIPTS,
  ENVELOPE_SCRIPT_IDS,
  type EnvelopeScriptId
} from '@formatavern/shared';
import { abortableSleep } from './utils';

export class MockLLMProvider implements LLMProvider {
  id = 'mock';
  capabilities = {
    chatCompletion: true,
    textCompletion: false,
    listModels: true,
    prefill: true,
    nativeStateChannel: false
  };
  readonly calls: LLMRequest[] = [];

  constructor(
    private opts: {
      intervalMs?: number;
      scripts?: typeof ENVELOPE_SCRIPTS;
    } = {}
  ) {}

  async listModels(): Promise<ModelInfo[]> {
    return ENVELOPE_SCRIPT_IDS.map((id) => ({
      id: `mock:${id}`,
      name: id,
      contextLength: 8192
    }));
  }

  async *generate(req: LLMRequest, signal?: AbortSignalLike): AsyncIterable<StreamEvent> {
    this.calls.push(req);

    if (signal?.aborted) {
      yield { type: 'done', finishReason: 'aborted' };
      return;
    }

    const scripts = this.opts.scripts ?? ENVELOPE_SCRIPTS;
    const model = req.model ?? 'mock:envelope-directive';

    let scriptId: EnvelopeScriptId | undefined;
    if (model.startsWith('mock:')) {
      scriptId = model.slice(5) as EnvelopeScriptId;
    } else {
      scriptId = model as EnvelopeScriptId;
    }

    const script = scripts[scriptId];
    if (!script) {
      yield {
        type: 'error',
        message: `unknown mock script "${model}"`,
        recoverable: false
      };
      return;
    }

    const interval = this.opts.intervalMs ?? 40;

    for (let i = 0; i < script.chunks.length; i++) {
      if (signal?.aborted) {
        yield { type: 'done', finishReason: 'aborted' };
        return;
      }

      const chunk = script.chunks[i];
      if (chunk.length > 0) {
        yield { type: 'token', text: chunk };
      }

      if (i < script.chunks.length - 1 && interval > 0) {
        await abortableSleep(interval, signal);
        if (signal?.aborted) {
          yield { type: 'done', finishReason: 'aborted' };
          return;
        }
      }
    }

    if (signal?.aborted) {
      yield { type: 'done', finishReason: 'aborted' };
      return;
    }

    if (script.terminal.type === 'error') {
      yield script.terminal;
    } else {
      yield { type: 'usage', promptTokens: 42, completionTokens: 98 };
      yield script.terminal;
    }
  }
}

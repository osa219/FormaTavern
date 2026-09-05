import { OpenRouterProvider } from '../src/providers/openrouter';
import { buildPrompt } from '../src/prompt/builder';
import { parseEnvelope, defaultState, resolveState } from '@formatavern/shared';
import { eldrin } from '../src/db/seeds/characters';
import { defaultPersona } from '../src/db/seeds/personas';

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.log('[smoke:openrouter] Skipped: OPENROUTER_API_KEY is not set.');
  process.exit(0);
}

console.log('[smoke:openrouter] Starting live OpenRouter smoke test with Eldrin the Mage...');

const ctx = {
  character: eldrin,
  persona: defaultPersona,
  chat: {
    narrativeMode: 'narrative' as const,
    envelopeDialect: 'directive' as const,
    standingDirection: 'Speak with ancient astrological wisdom.'
  },
  history: [
    {
      id: '1',
      role: 'user' as const,
      narrativeRole: 'persona' as const,
      content: 'Master Eldrin, the northern stars seem misaligned tonight. What does this portend?',
      status: 'complete' as const
    }
  ],
  sceneState: eldrin.initialState,
  budget: {
    contextLength: 8192,
    reservedCompletion: 1024,
    safetyFactor: 0.9
  },
  provider: {
    prefill: true
  }
};

const built = buildPrompt(ctx);
const provider = new OpenRouterProvider({
  apiKey,
  defaultModel: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet'
});

console.log(`[smoke:openrouter] Model: ${process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet'}`);
console.log('[smoke:openrouter] Streaming response:\n---');

let fullText = '';

for await (const event of provider.generate({
  systemPrompt: built.systemPrompt,
  history: built.history,
  stop: built.stop,
  assistantPrefill: built.assistantPrefill
})) {
  if (event.type === 'token') {
    process.stdout.write(event.text);
    fullText += event.text;
  } else if (event.type === 'usage') {
    console.log(`\n---\n[usage] prompt: ${event.promptTokens}, completion: ${event.completionTokens}`);
  } else if (event.type === 'error') {
    console.error(`\n[error] ${event.message} (recoverable: ${event.recoverable})`);
  } else if (event.type === 'done') {
    console.log(`\n[done] finishReason: ${event.finishReason}`);
  }
}

console.log('\n--- Parse Summary ---');
const parsed = parseEnvelope(fullText, {
  primaryCharacter: eldrin.name,
  dialect: 'directive',
  personaName: defaultPersona.name
});

console.log('Dialect:', parsed.dialect);
console.log('Adherent:', parsed.adherent);
console.log('Segments count:', parsed.segments.length);
for (const seg of parsed.segments) {
  console.log(`  [${seg.kind}${seg.name ? `:${seg.name}` : ''}] ${seg.text.slice(0, 50)}...`);
}
console.log('State patch:', parsed.statePatch);
console.log('Warnings:', parsed.warnings);

const resolved = resolveState(defaultState(eldrin), parsed.statePatch, eldrin.stateSchema);
console.log('Resolved state:', resolved.state);

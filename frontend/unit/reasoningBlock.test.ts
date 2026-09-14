import { describe, it, expect } from 'bun:test';
import { extractLiveReasoning } from '../src/lib/state/stream.svelte';

const blockUrl = new URL(
  '../src/lib/components/chat/ReasoningBlock.svelte',
  import.meta.url
);
const turnUrl = new URL(
  '../src/lib/components/chat/MessageTurn.svelte',
  import.meta.url
);

describe('ReasoningBlock & Live Thought Stream (Invariant U3, U4)', () => {
  it('extracts live reasoning and thinking status from stream buffer', () => {
    // Empty buffer
    expect(extractLiveReasoning('')).toEqual({ reasoning: null, isThinking: false });

    // Stream with unclosed reasoning
    expect(extractLiveReasoning('<think>Analyzing the user prompt...')).toEqual({
      reasoning: 'Analyzing the user prompt...',
      isThinking: true
    });

    // Stream with closed reasoning and following text
    expect(
      extractLiveReasoning('<think>Calculated outcome.</think>\n::: speech\nHello!')
    ).toEqual({
      reasoning: 'Calculated outcome.',
      isThinking: false
    });

    // Case-insensitive tags (<THINKING>, <reasoning>)
    expect(extractLiveReasoning('<THINKING>Deep thought</THINKING>')).toEqual({
      reasoning: 'Deep thought',
      isThinking: false
    });

    // Plain story text with no thinking
    expect(extractLiveReasoning('Just plain narrative.')).toEqual({
      reasoning: null,
      isThinking: false
    });
  });

  it('ReasoningBlock component maintains structural contract, details wrapper, and semantic chrome tokens', async () => {
    const source = await Bun.file(blockUrl).text();

    // Uses <details> container with summary
    expect(source).toContain('<details');
    expect(source).toContain('<summary');
    expect(source).toContain('reasoning-block');

    // Theme-aware tokens: border-accent, text-(--chrome-text), bg-(--chrome-surface)
    expect(source).toContain('border-accent');
    expect(source).toContain('text-(--chrome-text)');
    expect(source).toContain('bg-(--chrome-surface)');

    // Shows Thinking... with pulsing indicator when active
    expect(source).toContain('animate-pulse');
    expect(source).toContain('Thinking…');

    // Hidden when empty
    expect(source).toContain('hasReasoning || activeThinking');

    // MessageTurn incorporates ReasoningBlock
    const turnSource = await Bun.file(turnUrl).text();
    expect(turnSource).toContain('import ReasoningBlock from \'./ReasoningBlock.svelte\'');
    expect(turnSource).toContain('<ReasoningBlock {reasoning} durationMs={reasoningDurationMs} {isThinking} {streaming} />');
  });
});

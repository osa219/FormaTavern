import { describe, it, expect } from 'bun:test';
import type { CharacterPromptPreview } from '../../src/prompt/types';
import { setupTestApp } from './helpers';

async function preview(
  app: { handle: (req: Request) => Promise<Response> },
  body: unknown = {}
): Promise<{ status: number; json: any }> {
  const res = await app.handle(
    new Request('http://127.0.0.1/api/characters/prompt-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
  return { status: res.status, json: await res.json() };
}

const eldrinDraft = {
  name: 'Eldrin the Mage',
  description: 'An ancient archmage bound to a celestial observatory.',
  personality: 'Cryptic, deliberate, sharp-tongued, but secretly protective.',
  scenario: 'The observatory hums as cosmic alignments shift.',
  firstMessage: '*The observatory hums…* "You arrive as the ley lines align."',
  exampleDialogue: 'Traveler: Who are you?\nEldrin the Mage: Time is thin. Speak plainly.'
};

describe('routes/characters prompt-preview (§6 dry run)', () => {
  it('resolves static blocks from an unsaved draft card with no history', async () => {
    const { app } = setupTestApp();

    const { status, json } = await preview(app, { card: eldrinDraft });
    expect(status).toBe(200);
    const result = json as CharacterPromptPreview;

    // Static character blocks resolve from the draft, not the DB.
    for (const id of ['1', '1b', '2', '3', '4', '5', '7'] as const) {
      expect(result.prompt.blocks.find((b) => b.id === id)!.included).toBe(true);
    }
    expect(result.prompt.blocks.find((b) => b.id === '2')!.text).toContain('archmage');

    // No persisted history: one synthetic continue-scene turn carries the bottom blocks.
    expect(result.prompt.history.length).toBe(1);
    expect(result.prompt.history[0].role).toBe('user');
    expect(result.prompt.blocks.find((b) => b.id === '8')!.included).toBe(true);
    expect(result.prompt.blocks.find((b) => b.id === '6b')!.included).toBe(false);
    expect(result.prompt.blocks.find((b) => b.id === '7b')!.included).toBe(false);
    expect(result.prompt.blocks.find((b) => b.id === '9b')!.included).toBe(false);

    // Greeting parses against the draft name.
    expect(result.greeting).not.toBeNull();
    expect(result.greeting!.segments.length).toBeGreaterThan(0);
    expect(Array.isArray(result.greeting!.warnings)).toBe(true);
  });

  it('tolerates a near-empty card with neutral defaults', async () => {
    const { app } = setupTestApp();

    const { status, json } = await preview(app, { card: { name: '', description: '' } });
    expect(status).toBe(200);
    const result = json as CharacterPromptPreview;

    expect(result.prompt.blocks.find((b) => b.id === '2')!.included).toBe(false);
    expect(result.prompt.blocks.find((b) => b.id === '2')!.reason).toBe('character description blank');
    expect(result.greeting).toBeNull();
    expect(result.prompt.systemPrompt.length).toBeGreaterThan(0);
  });

  it('accepts an empty body (blank canvas preview)', async () => {
    const { app } = setupTestApp();

    const { status, json } = await preview(app, {});
    expect(status).toBe(200);
    expect((json as CharacterPromptPreview).prompt.blocks.length).toBe(15);
  });
});

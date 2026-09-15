import { describe, it, expect } from 'bun:test';
import type { ChatView } from '@formatavern/shared';
import type { BuiltPrompt } from '../../src/prompt/types';
import { setupTestApp } from './helpers';

async function preview(
  app: { handle: (req: Request) => Promise<Response> },
  chatId: string,
  body: unknown = {}
): Promise<{ status: number; json: any }> {
  const res = await app.handle(
    new Request(`http://127.0.0.1/api/chats/${chatId}/prompt-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
  return { status: res.status, json: await res.json() };
}

describe('routes/chats prompt-preview (§5 dry run)', () => {
  it('returns the assembled prompt without writing anything', async () => {
    const { app, repos } = setupTestApp();

    const createRes = await app.handle(
      new Request('http://127.0.0.1/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: 'eldrin-the-mage' })
      })
    );
    expect(createRes.status).toBe(201);
    const chat = (await createRes.json()) as ChatView;
    const before = repos.messages.countInChat(chat.id);

    const { status, json } = await preview(app, chat.id);
    expect(status).toBe(200);
    const built = json as BuiltPrompt;

    expect(typeof built.systemPrompt).toBe('string');
    expect(built.systemPrompt.length).toBeGreaterThan(0);
    expect(Array.isArray(built.history)).toBe(true);
    expect(built.history.length).toBeGreaterThan(0);
    expect(Array.isArray(built.stop)).toBe(true);
    expect(Array.isArray(built.blocks)).toBe(true);
    expect(built.blocks.length).toBe(15);
    expect(typeof built.tokens.total).toBe('number');
    expect(Array.isArray(built.warnings)).toBe(true);

    // Included blocks carry text for the copy button; skipped blocks say why.
    const block1 = built.blocks.find((b) => b.id === '1')!;
    expect(block1.included).toBe(true);
    expect(block1.text).toContain('roleplay assistant');
    const block2 = built.blocks.find((b) => b.id === '2')!;
    expect(block2.included).toBe(true);
    expect(block2.text).toContain('archmage');
    const block6 = built.blocks.find((b) => b.id === '6')!;
    expect(block6.included).toBe(false);
    expect(block6.reason).toBe('no lorebook entries');

    // Dry run: nothing written.
    expect(repos.messages.countInChat(chat.id)).toBe(before);
    expect(repos.chats.get(chat.id)!.activeLeafId).toBe(chat.activeLeafId);
  });

  it('includes an unsent draft in history and the director-note block', async () => {
    const { app, repos } = setupTestApp();

    const chat = repos.chats.create({
      id: 'c-preview-draft',
      title: 'Preview Draft',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });
    repos.messages.insert({
      id: '01PREVU1',
      chatId: chat.id,
      parentId: null,
      role: 'user',
      narrativeRole: 'persona',
      content: 'Hello there.',
      status: 'complete'
    });
    repos.chats.setActiveLeaf(chat.id, '01PREVU1');

    const { status, json } = await preview(app, chat.id, {
      draft: { message: 'Unsent hello.', directorNote: 'Reply tersely.' }
    });
    expect(status).toBe(200);
    const built = json as BuiltPrompt;

    const last = built.history[built.history.length - 1];
    expect(last.content).toContain('Unsent hello.');
    // Bottom blocks attached exactly once (no duplicated closing instruction).
    expect(last.content.match(/Reply using the directive block format/g)?.length).toBe(1);
    const block9b = built.blocks.find((b) => b.id === '9b')!;
    expect(block9b.included).toBe(true);
    expect(block9b.text).toContain('Reply tersely.');

    // And without the draft the note block stays out.
    const base = await preview(app, chat.id);
    expect((base.json as BuiltPrompt).blocks.find((b) => b.id === '9b')!.included).toBe(false);

    // Still nothing written.
    expect(repos.messages.countInChat(chat.id)).toBe(1);
  });

  it('handles an empty chat with no history', async () => {
    const { app, repos } = setupTestApp();

    const empty = repos.chats.create({
      id: 'c-preview-empty',
      title: 'Empty',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default',
      metadata: { envelopeDialect: 'directive', narrativeMode: 'narrative' }
    });

    const { status, json } = await preview(app, empty.id);
    expect(status).toBe(200);
    const built = json as BuiltPrompt;
    // No persisted turns: a single synthetic continue-scene turn carries the bottom blocks.
    expect(built.history.length).toBe(1);
    expect(built.history[0].role).toBe('user');
    expect(built.history[0].content.startsWith('[Continue the scene.]')).toBe(true);
    expect(built.history[0].content.match(/Reply using the directive block format/g)?.length).toBe(1);
    // Block 8 reports history exactly as sent, so the synthetic turn counts.
    const block8 = built.blocks.find((b) => b.id === '8')!;
    expect(block8.included).toBe(true);
    expect(block8.tokens).toBeGreaterThan(0);
    // Static character blocks still resolve.
    expect(built.blocks.find((b) => b.id === '2')!.included).toBe(true);
  });

  it('returns 404 for an unknown chat', async () => {
    const { app } = setupTestApp();
    const { status } = await preview(app, 'no-such-chat');
    expect(status).toBe(404);
  });
});

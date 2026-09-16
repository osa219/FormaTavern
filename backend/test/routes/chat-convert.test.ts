import { describe, it, expect } from 'bun:test';
import { setupTestApp } from './helpers';

const DIRECTIVE_TURN =
  ':::narrator\nRain falls.\n:::\n\n:::character[Eldrin the Mage]\nCome in.\n:::\n\n```state\n{"mood":"calm"}\n```';

function seedChat(repos: any, id: string, rows: Array<Record<string, any>>, mode = 'narrative', dialect = 'directive') {
  const chat = repos.chats.create({
    id,
    title: 'Convert Me',
    primaryCharacterId: 'eldrin-the-mage',
    activePersonaId: 'persona-default',
    metadata: { envelopeDialect: dialect, narrativeMode: mode }
  });
  for (const [i, r] of rows.entries()) {
    repos.messages.insert({
      id: `${id}-M${i}`,
      chatId: chat.id,
      parentId: i === 0 ? null : `${id}-M${i - 1}`,
      role: 'assistant',
      narrativeRole: 'character',
      content: '',
      status: 'complete',
      ...r
    });
  }
  const leaf = `${id}-M${rows.length - 1}`;
  repos.chats.setActiveLeaf(chat.id, leaf);
  return chat;
}

async function convert(
  app: { handle: (req: Request) => Promise<Response> },
  chatId: string,
  body: unknown = {}
): Promise<{ status: number; json: any }> {
  const res = await app.handle(
    new Request(`http://127.0.0.1/api/chats/${chatId}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
  return { status: res.status, json: await res.json() };
}

describe('routes/chats convert (dialect conversion)', () => {
  it('re-renders turns into the target dialect, passing persona prose through', async () => {
    const { app, repos } = setupTestApp();
    const chat = seedChat(repos, 'c-conv-ok', [
      { role: 'user', narrativeRole: 'persona', senderName: 'Traveler', content: 'Hello there.' },
      { senderName: 'Eldrin the Mage', content: DIRECTIVE_TURN }
    ]);

    const { status, json } = await convert(app, chat.id, { targetDialect: 'xml' });
    expect(status).toBe(200);
    expect(json.converted).toBe(1);
    expect(json.unchanged).toBe(1);
    expect(json.targetDialect).toBe('xml');

    const userRow = repos.messages.get('c-conv-ok-M0')!;
    expect(userRow.content).toBe('Hello there.');

    const asstRow = repos.messages.get('c-conv-ok-M1')!;
    expect(asstRow.content).toContain('<narrator>');
    expect(asstRow.content).toContain('Rain falls.');
    expect(asstRow.content).toContain('<state>');
    expect(asstRow.content).not.toContain(':::');
    expect(asstRow.metadata.parse?.dialect).toBe('xml');
    expect(repos.chats.get(chat.id)!.metadata.envelopeDialect).toBe('xml');
  });

  it('round-trips back to byte-identical content (E3 stability)', async () => {
    const { app, repos } = setupTestApp();
    seedChat(repos, 'c-conv-rt', [{ senderName: 'Eldrin the Mage', content: DIRECTIVE_TURN }]);

    await convert(app, 'c-conv-rt', { targetDialect: 'xml' });
    const mid = repos.messages.get('c-conv-rt-M0')!.content;
    expect(mid).not.toBe(DIRECTIVE_TURN);

    const back = await convert(app, 'c-conv-rt', { targetDialect: 'directive' });
    expect(back.status).toBe(200);
    expect(repos.messages.get('c-conv-rt-M0')!.content).toBe(DIRECTIVE_TURN);
  });

  it('keeps stored segment voices stable (plain narrator prose stays narrator)', async () => {
    const { app, repos } = setupTestApp();
    const chat = seedChat(repos, 'c-conv-voice', [
      {
        role: 'user',
        narrativeRole: 'narrator',
        senderName: null,
        content: 'Rain drums on.',
        segments: [{ kind: 'narrator', text: 'Rain drums on.' }]
      }
    ]);

    const { status } = await convert(app, chat.id, { targetDialect: 'xml' });
    expect(status).toBe(200);
    const row = repos.messages.get('c-conv-voice-M0')!;
    expect(row.segments).toEqual([{ kind: 'narrator', text: 'Rain drums on.' }]);
    expect(row.content).toContain('<narrator>');
    expect(row.content).not.toContain('<character');
  });

  it('preserves reasoning blocks re-wrapped in think tags', async () => {
    const { app, repos } = setupTestApp();
    seedChat(repos, 'c-conv-think', [
      {
        senderName: 'Eldrin the Mage',
        content: '<think>Planning the greeting.</think>\n\n:::character[Eldrin the Mage]\nWelcome.\n:::'
      }
    ]);

    const { status } = await convert(app, 'c-conv-think', { targetDialect: 'xml' });
    expect(status).toBe(200);
    const row = repos.messages.get('c-conv-think-M0')!;
    expect(row.content).toContain('Planning the greeting.');
    expect(row.content).toContain('<character name="Eldrin the Mage">');
  });

  it('aborts atomically on persona-voiced content, writing nothing', async () => {
    const { app, repos } = setupTestApp();
    seedChat(repos, 'c-conv-bad', [
      { senderName: 'Eldrin the Mage', content: DIRECTIVE_TURN },
      {
        senderName: 'Eldrin the Mage',
        content: ':::character[Eldrin the Mage]\nFine.\n:::\n\n:::persona\nI wander.\n:::'
      }
    ]);

    const { status, json } = await convert(app, 'c-conv-bad', { targetDialect: 'xml' });
    expect(status).toBe(422);
    expect(JSON.stringify(json)).toContain('c-conv-bad-M1');

    // Atomic: even the convertible turn is untouched, dialect unflipped.
    expect(repos.messages.get('c-conv-bad-M0')!.content).toBe(DIRECTIVE_TURN);
    expect(repos.chats.get('c-conv-bad')!.metadata.envelopeDialect).toBe('directive');
  });

  it('rejects classic chats, same-dialect targets, and unknown chats', async () => {
    const { app, repos } = setupTestApp();
    seedChat(repos, 'c-conv-classic', [{ content: 'Plain prose.' }], 'classic', undefined as any);

    const classic = await convert(app, 'c-conv-classic', { targetDialect: 'xml' });
    expect(classic.status).toBe(422);

    seedChat(repos, 'c-conv-same', [{ content: DIRECTIVE_TURN }]);
    const same = await convert(app, 'c-conv-same', { targetDialect: 'directive' });
    expect(same.status).toBe(422);

    const missing = await convert(app, 'no-such-chat', { targetDialect: 'xml' });
    expect(missing.status).toBe(404);
  });
});

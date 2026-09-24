import { describe, it, expect } from 'bun:test';
import { setupTestApp } from './helpers';
import { createMinimalPng, embedPngTextChunk } from '../../src/import/v2/png';

function v2PngBytes(name: string): Uint8Array {
  const payload = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name,
      description: 'Preview description',
      personality: 'Preview personality',
      scenario: 'Preview scenario',
      first_mes: 'Preview greeting',
      mes_example: '',
      creator: 'Preview Author',
      character_version: '1.0',
      alternate_greetings: ['Alt one'],
      tags: ['preview', 'test'],
      system_prompt: '',
      post_history_instructions: '',
      creator_notes: '',
      extensions: {}
    }
  };
  const base64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  return embedPngTextChunk(createMinimalPng(), 'chara', base64);
}

async function postPreview(app: any, filename: string, bytes: Uint8Array, mime: string) {
  const formData = new FormData();
  formData.append('file', new Blob([bytes as any], { type: mime }), filename);
  return app.handle(
    new Request('http://127.0.0.1/api/import/preview', { method: 'POST', body: formData })
  );
}

describe('routes/import/preview (parse-only, no writes)', () => {
  it('previews a V2 PNG without writing to the database', async () => {
    const { app, repos } = setupTestApp();
    const before = repos.characters.count();

    const res = await postPreview(app, 'hero.png', v2PngBytes('Preview Hero'), 'image/png');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.kind).toBe('character');
    expect(body.format).toBe('tavern-v2');
    expect(body.card.name).toBe('Preview Hero');
    expect(body.card.personality).toBe('Preview personality');
    expect(body.card.alternateGreetings).toEqual(['Alt one']);
    expect(typeof body.avatarDataUrl).toBe('string');
    expect(body.avatarDataUrl.startsWith('data:image/png;base64,')).toBe(true);

    // Parse-only proof: zero rows created.
    expect(repos.characters.count()).toBe(before);
  });

  it('previews a V2 JSON card and warns about the missing avatar', async () => {
    const { app, repos } = setupTestApp();
    const before = repos.characters.count();

    const json = JSON.stringify({
      spec: 'chara_card_v2',
      data: { name: 'Json Hero', description: 'd', personality: 'p', scenario: 's', first_mes: 'hi' }
    });
    const res = await postPreview(app, 'hero.json', new TextEncoder().encode(json), 'application/json');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.kind).toBe('character');
    expect(body.card.name).toBe('Json Hero');
    expect(body.avatarDataUrl).toBeUndefined();
    expect(body.warnings.length).toBeGreaterThan(0);
    expect(repos.characters.count()).toBe(before);
  });

  it('previews a custom_engine character with listing identity mapping', async () => {
    const { app, repos } = setupTestApp();
    const before = repos.characters.count();

    const json = JSON.stringify({
      id: 'preview-ce-1',
      card_title: 'A Bad Day Needs a Good Distraction',
      chat_name: 'Mildred',
      description: '<p>Hook blurb</p>',
      personality: 'Warm',
      scenario: 'Porch',
      first_message: 'Hey.',
      creator_notes: 'Notes here',
      tags: ['Fluff']
    });
    const res = await postPreview(app, 'mildred.json', new TextEncoder().encode(json), 'application/json');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.kind).toBe('character');
    expect(body.format).toBe('custom-engine');
    expect(body.card.name).toBe('A Bad Day Needs a Good Distraction');
    expect(body.card.characterName).toBe('Mildred');
    expect(body.card.description).toBe('');
    expect(body.card.showcase).toContain('Hook blurb');
    expect(body.card.showcase).toContain('Author notes');
    expect(repos.characters.count()).toBe(before);
  });

  it('summarizes a JSONL transcript without importing it', async () => {
    const { app, repos } = setupTestApp();
    const beforeChats = repos.chats.list().length;

    const jsonl = [
      JSON.stringify({ user_name: 'Wanderer', character_name: 'Sage', chat_metadata: { title: 'Trail Chat' } }),
      JSON.stringify({ name: 'Wanderer', is_user: true, mes: 'Hello' }),
      JSON.stringify({ name: 'Sage', is_user: false, mes: 'Hi', swipes: ['Hi', 'Hey'] }),
      'not-json{{{'
    ].join('\n');
    const res = await postPreview(app, 'trail.jsonl', new TextEncoder().encode(jsonl), 'application/octet-stream');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.kind).toBe('chat');
    expect(body.format).toBe('sillytavern-jsonl');
    expect(body.title).toBe('Trail Chat');
    expect(body.messageCount).toBe(2);
    expect(repos.chats.list().length).toBe(beforeChats);
  });

  it('summarizes a custom_engine chat JSON without importing it', async () => {
    const { app, repos } = setupTestApp();
    const beforeChats = repos.chats.list().length;

    const json = JSON.stringify({
      id: 'preview-chat-1',
      character_id: 'some-char',
      title: 'Porch Talk',
      messages: [
        { id: 'm0', chat_id: 'preview-chat-1', sequence_index: 0, role: 'assistant', content: 'Hey' },
        { id: 'm1', chat_id: 'preview-chat-1', sequence_index: 1, role: 'user', content: 'Hi' }
      ]
    });
    const res = await postPreview(app, 'chat.json', new TextEncoder().encode(json), 'application/json');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.kind).toBe('chat');
    expect(body.format).toBe('custom-engine-chat');
    expect(body.title).toBe('Porch Talk');
    expect(body.messageCount).toBe(2);
    expect(repos.chats.list().length).toBe(beforeChats);
  });

  it('rejects unsupported files with 422 and PNGs without card metadata', async () => {
    const { app } = setupTestApp();

    const garbage = await postPreview(app, 'nope.bin', new Uint8Array([0, 1, 2, 3, 4]), 'application/octet-stream');
    expect(garbage.status).toBe(422);

    const barePng = await postPreview(app, 'bare.png', createMinimalPng(), 'image/png');
    expect(barePng.status).toBe(422);
  });
});

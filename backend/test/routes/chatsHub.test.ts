import { describe, it, expect } from 'bun:test';
import type { ChatHubResponse, ChatView } from '@formatavern/shared';
import { setupTestApp } from './helpers';

describe('routes/chats/hub', () => {
  it('returns empty hub when no chats exist', async () => {
    const { app, db } = setupTestApp();
    // Clear seeded chats
    db.run('DELETE FROM chats;');

    const res = await app.handle(new Request('http://127.0.0.1/api/chats/hub'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as ChatHubResponse;
    expect(data.items).toEqual([]);
    expect(data.totalCharacters).toBe(0);
    expect(data.totalChats).toBe(0);
    expect(data.nextCursor).toBeNull();
  });

  it('returns grouped characters with eager top-3 recent chats and global totals', async () => {
    const { app, repos } = setupTestApp();

    // Create 4 chats for eldrin
    for (let i = 1; i <= 4; i++) {
      const c = repos.chats.create({
        id: `chat-eldrin-${i}`,
        title: `Eldrin Chat ${i}`,
        primaryCharacterId: 'eldrin-the-mage',
        activePersonaId: 'persona-default'
      });
      repos.chats.update(c.id, { updatedAt: 1000 + i * 100 });
    }

    const res = await app.handle(new Request('http://127.0.0.1/api/chats/hub'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as ChatHubResponse;

    expect(data.totalCharacters).toBeGreaterThanOrEqual(1);
    expect(data.totalChats).toBeGreaterThanOrEqual(4);

    const eldrinGroup = data.items.find((g) => g.character.id === 'eldrin-the-mage');
    expect(eldrinGroup).toBeDefined();
    expect(eldrinGroup!.chatCount).toBe(4);
    expect(eldrinGroup!.character.name).toBe('Eldrin the Mage');
    expect(eldrinGroup!.character.description).toBeDefined();

    // Eager top 3 chats: should be 3 chats, ordered newest first
    expect(eldrinGroup!.recentChats.length).toBe(3);
    expect(eldrinGroup!.recentChats[0].id).toBe('chat-eldrin-4');
    expect(eldrinGroup!.recentChats[1].id).toBe('chat-eldrin-3');
    expect(eldrinGroup!.recentChats[2].id).toBe('chat-eldrin-2');
  });

  it('supports keyset pagination across pages and respects limit clamp', async () => {
    const { app, repos } = setupTestApp();

    // Create 5 characters each with 1 chat
    for (let i = 1; i <= 5; i++) {
      const charId = `char-page-${i}`;
      repos.characters.upsert({
        id: charId,
        name: `Character Page ${i}`,
        description: `Desc ${i}`,
        personality: 'Friendly',
        scenario: 'Testing',
        firstMessage: 'Hello',
        style: repos.characters.get('eldrin-the-mage')!.style
      });
      const c = repos.chats.create({
        id: `chat-page-${i}`,
        title: `Chat Page ${i}`,
        primaryCharacterId: charId,
        activePersonaId: 'persona-default'
      });
      repos.chats.update(c.id, { updatedAt: 2000 + i * 50 });
    }

    // Page 1 with limit=2
    const res1 = await app.handle(new Request('http://127.0.0.1/api/chats/hub?limit=2&sort=recent'));
    expect(res1.status).toBe(200);
    const page1 = (await res1.json()) as ChatHubResponse;
    expect(page1.items.length).toBe(2);
    expect(page1.nextCursor).not.toBeNull();

    // Page 2 using nextCursor
    const res2 = await app.handle(
      new Request(`http://127.0.0.1/api/chats/hub?limit=2&sort=recent&cursor=${encodeURIComponent(page1.nextCursor!)}`)
    );
    expect(res2.status).toBe(200);
    const page2 = (await res2.json()) as ChatHubResponse;
    expect(page2.items.length).toBe(2);
    expect(page2.nextCursor).not.toBeNull();

    // Ensure no overlapping characters between pages
    const idsPage1 = new Set(page1.items.map((it) => it.character.id));
    for (const it of page2.items) {
      expect(idsPage1.has(it.character.id)).toBe(false);
    }

    // Test limit clamp: limit=999 should be clamped to 50
    const resClamp = await app.handle(new Request('http://127.0.0.1/api/chats/hub?limit=999'));
    expect(resClamp.status).toBe(200);
  });

  it('handles invalid or malformed cursors gracefully', async () => {
    const { app } = setupTestApp();

    // Gibberish cursor
    const res = await app.handle(new Request('http://127.0.0.1/api/chats/hub?cursor=invalid-non-base64-json!'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as ChatHubResponse;
    expect(Array.isArray(data.items)).toBe(true);
  });

  it('supports sorting by recent, chats, and name', async () => {
    const { app, repos, db } = setupTestApp();
    db.run('DELETE FROM chats;');

    // Char A: 1 chat, updated at 3000
    repos.characters.upsert({
      id: 'char-alpha',
      name: 'Alpha Hero',
      description: 'Alpha',
      personality: 'A',
      scenario: 'A',
      firstMessage: 'A',
      style: repos.characters.get('eldrin-the-mage')!.style
    });
    const cA = repos.chats.create({
      id: 'chat-alpha-1',
      title: 'Alpha 1',
      primaryCharacterId: 'char-alpha',
      activePersonaId: 'persona-default'
    });
    repos.chats.update(cA.id, { updatedAt: 3000 });

    // Char Z: 5 chats, latest updated at 1000
    repos.characters.upsert({
      id: 'char-zeta',
      name: 'Zeta Hero',
      description: 'Zeta',
      personality: 'Z',
      scenario: 'Z',
      firstMessage: 'Z',
      style: repos.characters.get('eldrin-the-mage')!.style
    });
    for (let i = 1; i <= 5; i++) {
      const cZ = repos.chats.create({
        id: `chat-zeta-${i}`,
        title: `Zeta ${i}`,
        primaryCharacterId: 'char-zeta',
        activePersonaId: 'persona-default'
      });
      repos.chats.update(cZ.id, { updatedAt: 1000 + i * 10 });
    }

    // Sort by recent: Alpha (updated 3000) should precede Zeta (updated 1050)
    const resRecent = await app.handle(new Request('http://127.0.0.1/api/chats/hub?sort=recent'));
    const dataRecent = (await resRecent.json()) as ChatHubResponse;
    expect(dataRecent.items[0].character.id).toBe('char-alpha');
    expect(dataRecent.items[1].character.id).toBe('char-zeta');

    // Sort by chats: Zeta (5 chats) should precede Alpha (1 chat)
    const resChats = await app.handle(new Request('http://127.0.0.1/api/chats/hub?sort=chats'));
    const dataChats = (await resChats.json()) as ChatHubResponse;
    expect(dataChats.items[0].character.id).toBe('char-zeta');
    expect(dataChats.items[1].character.id).toBe('char-alpha');

    // Sort by name: Alpha should precede Zeta
    const resName = await app.handle(new Request('http://127.0.0.1/api/chats/hub?sort=name'));
    const dataName = (await resName.json()) as ChatHubResponse;
    expect(dataName.items[0].character.id).toBe('char-alpha');
    expect(dataName.items[1].character.id).toBe('char-zeta');
  });

  it('filters by search query across character fields and chat titles with wildcard escaping', async () => {
    const { app, repos, db } = setupTestApp();
    db.run('DELETE FROM chats;');

    repos.characters.upsert({
      id: 'char-alchemist',
      name: 'Aurelia 100% Pure',
      tagline: 'Master of potions',
      description: 'Works with rare herbs',
      personality: 'Inquisitive',
      scenario: 'Laboratory',
      firstMessage: 'Greetings',
      style: repos.characters.get('eldrin-the-mage')!.style
    });
    repos.chats.create({
      id: 'chat-alchemy-1',
      title: 'The Great Experiment_v1',
      primaryCharacterId: 'char-alchemist',
      activePersonaId: 'persona-default'
    });

    // Search for literal '100%' in name
    const res1 = await app.handle(new Request('http://127.0.0.1/api/chats/hub?q=100%25'));
    expect(res1.status).toBe(200);
    const data1 = (await res1.json()) as ChatHubResponse;
    expect(data1.items.length).toBe(1);
    expect(data1.items[0].character.id).toBe('char-alchemist');

    // Search by chat title containing literal '_'
    const res2 = await app.handle(new Request('http://127.0.0.1/api/chats/hub?q=Experiment_v1'));
    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as ChatHubResponse;
    expect(data2.items.length).toBe(1);
    expect(data2.items[0].character.id).toBe('char-alchemist');

    // Search non-existent
    const res3 = await app.handle(new Request('http://127.0.0.1/api/chats/hub?q=nonexistent_xyz'));
    expect(res3.status).toBe(200);
    const data3 = (await res3.json()) as ChatHubResponse;
    expect(data3.items.length).toBe(0);
  });

  it('annotates activeGenerationMessageId when a chat is streaming', async () => {
    const { app, repos, hub } = setupTestApp();

    const c = repos.chats.create({
      id: 'chat-streaming-test',
      title: 'Streaming Chat',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default'
    });

    // Register active job in hub
    const handle = hub.register({
      chatId: c.id,
      messageId: 'msg-stream-123'
    });

    const res = await app.handle(new Request('http://127.0.0.1/api/chats/hub'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as ChatHubResponse;

    const eldrinGroup = data.items.find((g) => g.character.id === 'eldrin-the-mage');
    expect(eldrinGroup).toBeDefined();
    const streamingChat = eldrinGroup!.recentChats.find((rc) => rc.id === c.id);
    expect(streamingChat).toBeDefined();
    expect(streamingChat!.activeGenerationMessageId).toBe('msg-stream-123');

    // Clean up hub
    handle.close();
  });

  it('bulk deletes chats for character while guarding active generation', async () => {
    const { app, repos, hub } = setupTestApp();

    const c1 = repos.chats.create({
      id: 'chat-bulk-1',
      title: 'Bulk 1',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default'
    });
    const c2 = repos.chats.create({
      id: 'chat-bulk-2',
      title: 'Bulk 2',
      primaryCharacterId: 'eldrin-the-mage',
      activePersonaId: 'persona-default'
    });

    // Simulate active generation on c2
    const handle = hub.register({
      chatId: c2.id,
      messageId: 'msg-bulk-active'
    });

    // Attempting bulk delete should be blocked with 409
    const resBlocked = await app.handle(
      new Request('http://127.0.0.1/api/chats/by-character/eldrin-the-mage', {
        method: 'DELETE'
      })
    );
    expect(resBlocked.status).toBe(409);
    const errBody = (await resBlocked.json()) as any;
    expect(errBody.error.code).toBe('chat_has_active_generation');

    // Clear active job
    handle.close();

    // Now bulk delete should succeed
    const resOk = await app.handle(
      new Request('http://127.0.0.1/api/chats/by-character/eldrin-the-mage', {
        method: 'DELETE'
      })
    );
    expect(resOk.status).toBe(200);
    const okBody = (await resOk.json()) as any;
    expect(okBody.deleted).toBe(true);
    expect(okBody.count).toBeGreaterThanOrEqual(2);

    // Verify all chats for eldrin are gone
    const remaining = repos.chats.list({ characterId: 'eldrin-the-mage' });
    expect(remaining.length).toBe(0);
  });

  it('verifies route precedence: /hub and /by-character/:id are not caught as /:id', async () => {
    const { app } = setupTestApp();

    // GET /hub must return 200 with hub payload, not 404 Chat hub not found
    const resGet = await app.handle(new Request('http://127.0.0.1/api/chats/hub'));
    expect(resGet.status).toBe(200);
    const data = (await resGet.json()) as any;
    expect(data.items).toBeDefined();

    // DELETE /by-character/:id must return 200 with deleted: true, not 404 Chat by-character not found
    const resDel = await app.handle(
      new Request('http://127.0.0.1/api/chats/by-character/non-existent-char', {
        method: 'DELETE'
      })
    );
    expect(resDel.status).toBe(200);
    const delData = (await resDel.json()) as any;
    expect(delData.deleted).toBe(true);
    expect(delData.count).toBe(0);
  });
});

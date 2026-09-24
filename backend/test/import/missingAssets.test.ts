import { describe, it, expect, afterEach } from 'bun:test';
import { createHash } from 'node:crypto';
import { createTestImportEnv, makePng, type TestImportEnv } from './testUtils';

describe('CustomEngine Missing Assets & Healing (X9)', () => {
  let env: TestImportEnv;

  afterEach(async () => {
    if (env) {
      await env.cleanup();
    }
  });

  it('records missing assets on message without failing the batch (X9)', async () => {
    env = await createTestImportEnv();

    const missingHash = 'deadbeef'.repeat(8); // valid 64-hex hash

    const char = {
      id: 'char-missing-asset',
      name: 'Artisan',
      description: 'Creates art',
      personality: 'Creative',
      scenario: 'Studio',
      first_message: 'Hi'
    };

    const chat = {
      id: 'chat-missing-asset',
      character_id: 'char-missing-asset',
      title: 'Art Discussion',
      messages: [
        {
          id: 'msg_art_0',
          chat_id: 'chat-missing-asset',
          sequence_index: 0,
          role: 'assistant',
          content: `Behold this painting: media://${missingHash}`,
          timestamp: 1000
        }
      ]
    };

    await env.writeCharacter(char);
    await env.writeChat(chat);

    // Sync without the media blob present
    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChars).toBe(1);
    expect(report.insertedChats).toBe(1);
    expect(report.appendedMessages).toBe(1);
    expect(report.missingAssets).toContain(missingHash);

    // Verify message has missing_assets populated
    const dbChat = env.repos.chats.findByProvenance('custom_engine', 'chat-missing-asset');
    expect(dbChat).not.toBeNull();

    const msg = env.repos.messages.get(dbChat!.activeLeafId!);
    expect(msg).not.toBeNull();
    expect(msg!.missingAssets).toBe(JSON.stringify([missingHash]));

    // Verify message_assets join row is NOT present yet
    const boundAssets = env.repos.assets.getMessageAssets(msg!.id);
    expect(boundAssets).not.toContain(missingHash);
  });

  it('heals missing assets on subsequent sync when blob arrives', async () => {
    env = await createTestImportEnv();

    const pngBytes = makePng(24, 24);
    const blobHash = createHash('sha256').update(pngBytes).digest('hex').toLowerCase();

    const char = {
      id: 'char-heal-test',
      name: 'Photographer',
      description: 'Takes photos',
      personality: 'Attentive',
      scenario: 'Darkroom',
      first_message: 'Developing...'
    };

    const chat = {
      id: 'chat-heal-test',
      character_id: 'char-heal-test',
      title: 'Photo Album',
      messages: [
        {
          id: 'msg_photo_0',
          chat_id: 'chat-heal-test',
          sequence_index: 0,
          role: 'assistant',
          content: `Here is the photo: media://${blobHash}`,
          timestamp: 1000
        }
      ]
    };

    await env.writeCharacter(char);
    await env.writeChat(chat);

    // Run 1: blob missing
    const report1 = await env.service.sync(env.sourceDir);
    expect(report1.missingAssets).toContain(blobHash);

    const dbChat = env.repos.chats.findByProvenance('custom_engine', 'chat-heal-test');
    const msgBefore = env.repos.messages.get(dbChat!.activeLeafId!);
    expect(msgBefore!.missingAssets).toBe(JSON.stringify([blobHash]));

    // Now write the missing blob into media/
    await env.writeMedia(blobHash, pngBytes, '.png');

    // Run 2: blob is now available
    const report2 = await env.service.sync(env.sourceDir);
    expect(report2.copiedBlobs).toBe(1);
    expect(report2.missingAssets).not.toContain(blobHash);

    // Verify message was healed
    const msgAfter = env.repos.messages.get(dbChat!.activeLeafId!);
    expect(msgAfter!.missingAssets).toBeNull();

    // Verify message_assets join row was created
    const boundAssets = env.repos.assets.getMessageAssets(msgAfter!.id);
    expect(boundAssets).toContain(blobHash);
  });

  it('successfully binds message and swipe media assets when blob is present on initial sync', async () => {
    env = await createTestImportEnv();

    const pngBytes = makePng(32, 32);
    const blobHash = createHash('sha256').update(pngBytes).digest('hex').toLowerCase();
    await env.writeMedia(blobHash, pngBytes, '.png');

    const char = {
      id: 'char-happy-media',
      name: 'Media Artist',
      description: 'Creates paintings',
      personality: 'Visual',
      scenario: 'Gallery',
      first_message: 'Welcome to the gallery'
    };

    const chat = {
      id: 'chat-happy-media',
      character_id: 'char-happy-media',
      title: 'Gallery Visit',
      messages: [
        {
          id: 'msg_media_0',
          chat_id: 'chat-happy-media',
          sequence_index: 0,
          role: 'assistant',
          content: `Primary painting: media://${blobHash}`,
          alternate_swipes: [`Swipe painting: media://${blobHash}`],
          timestamp: 1000
        }
      ]
    };

    await env.writeCharacter(char);
    await env.writeChat(chat);

    const report = await env.service.sync(env.sourceDir);
    expect(report.insertedChars).toBe(1);
    expect(report.insertedChats).toBe(1);
    expect(report.appendedMessages).toBe(2);
    expect(report.missingAssets).not.toContain(blobHash);

    const dbChat = env.repos.chats.findByProvenance('custom_engine', 'chat-happy-media');
    expect(dbChat).not.toBeNull();

    // The active leaf in tree mapping is the swipe (or main message depending on tree construction)
    // Find all messages in the chat to check bindings for both main message and swipe
    const allMsgs = env.repos.messages.listInChat(dbChat!.id);
    expect(allMsgs.length).toBe(2); // 1 main msg + 1 swipe

    for (const msg of allMsgs) {
      expect(msg.missingAssets).toBeNull();
      const boundAssets = env.repos.assets.getMessageAssets(msg.id);
      expect(boundAssets).toContain(blobHash);
    }
  });
});


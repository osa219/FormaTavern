import { ulid } from 'ulid';
import { slugify, type ChatView } from '@formatavern/shared';
import type { Repositories } from '../../db/contracts';
import { ApiError } from '../../engine/errors';

export interface SillyTavernChatHeader {
  user_name?: string;
  character_name?: string;
  create_date?: number | string;
  chat_metadata?: Record<string, unknown>;
}

export interface SillyTavernMessageLine {
  name?: string;
  is_user?: boolean;
  is_system?: boolean;
  send_date?: number | string;
  mes?: string;
  swipes?: string[];
  swipe_id?: number;
  extra?: Record<string, unknown>;
}

export async function importJsonlChat(
  fileBytes: Uint8Array,
  characterId: string,
  repos: Repositories
): Promise<ChatView> {
  const char = repos.characters.get(characterId);
  if (!char) {
    throw new ApiError('not_found', 404, `Character ${characterId} not found`);
  }

  const text = Buffer.from(fileBytes).toString('utf8');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new ApiError('unsupported_format', 422, 'JSONL chat file is empty');
  }

  let header: SillyTavernChatHeader = {};
  let startIndex = 0;

  // Check if Line 0 is a metadata header
  try {
    const line0 = JSON.parse(lines[0]);
    if (line0.user_name || line0.character_name || line0.chat_metadata) {
      header = line0;
      startIndex = 1;
    }
  } catch {
    throw new ApiError('unsupported_format', 422, 'Invalid JSON in line 0 of JSONL');
  }

  const userName = header.user_name?.trim() || 'User';
  let persona = repos.personas.findByName(userName);
  if (!persona) {
    const personaId = 'p-' + (slugify(userName) || ulid().toLowerCase());
    repos.personas.create({
      id: personaId,
      name: userName,
      description: '',
      isDefault: false
    });
    persona = repos.personas.get(personaId)!;
  }

  const now = Date.now();
  let createdAt = now;
  if (header.create_date) {
    const parsed = typeof header.create_date === 'number' ? header.create_date : Date.parse(header.create_date);
    if (!Number.isNaN(parsed) && parsed > 0) createdAt = parsed;
  }

  const chatMetadata = (header.chat_metadata ?? {}) as Record<string, any>;
  const title =
    typeof chatMetadata.title === 'string' && chatMetadata.title.trim()
      ? chatMetadata.title.trim()
      : typeof chatMetadata.chat_title === 'string' && chatMetadata.chat_title.trim()
        ? chatMetadata.chat_title.trim()
        : `Chat with ${char.name}`;
  const personaSnapshot = JSON.stringify({ name: userName });

  const createdChat = repos.chats.create({
    id: 'c_' + ulid().toLowerCase(),
    title,
    primaryCharacterId: char.id,
    activePersonaId: persona.id,
    personaSnapshot,
    metadata: chatMetadata as any
  });

  const chatId = createdChat.id;
  let currentMainId: string | null = null;
  let lastMainId: string | null = null;
  let sequenceIndex = 0;

  for (let i = startIndex; i < lines.length; i++) {
    let msgData: SillyTavernMessageLine;
    try {
      msgData = JSON.parse(lines[i]);
    } catch {
      continue; // Skip malformed lines
    }

    const isUser = Boolean(msgData.is_user);
    const isSystem = Boolean(msgData.is_system);
    const role = isSystem ? 'system' : isUser ? 'user' : 'assistant';
    const narrativeRole = isUser ? 'persona' : isSystem ? 'narrator' : 'character';
    const senderId = isUser ? persona.id : char.id;
    const senderName = msgData.name ?? (isUser ? userName : char.name);

    let msgTime = createdAt + sequenceIndex * 1000;
    if (msgData.send_date) {
      const parsed = typeof msgData.send_date === 'number' ? msgData.send_date : Date.parse(msgData.send_date);
      if (!Number.isNaN(parsed) && parsed > 0) msgTime = parsed;
    }

    const metadata: Record<string, unknown> = msgData.extra ? { ...msgData.extra } : {};
    if (isSystem) metadata.system = true;

    // Determine active swipe vs alternates
    let activeContent = msgData.mes ?? '';
    const swipes = Array.isArray(msgData.swipes) ? msgData.swipes.filter((s) => typeof s === 'string') : [];

    if (swipes.length > 0) {
      const activeIdx = typeof msgData.swipe_id === 'number' && msgData.swipe_id >= 0 && msgData.swipe_id < swipes.length
        ? msgData.swipe_id
        : 0;
      activeContent = swipes[activeIdx] ?? activeContent;
    }

    const mainMsg = repos.messages.insert({
      id: 'm_' + ulid().toLowerCase(),
      chatId,
      parentId: currentMainId,
      senderId,
      senderName,
      role,
      narrativeRole,
      content: activeContent,
      segments: [],
      state: null,
      status: 'complete',
      createdAt: msgTime,
      sequenceIndex,
      metadata: metadata as any
    });

    currentMainId = mainMsg.id;
    lastMainId = mainMsg.id;

    // Insert alternate swipe sibling rows sharing the same parentId
    if (swipes.length > 1) {
      for (let sIdx = 0; sIdx < swipes.length; sIdx++) {
        if (swipes[sIdx] === activeContent) continue;
        repos.messages.insert({
          id: 'm_' + ulid().toLowerCase(),
          chatId,
          parentId: mainMsg.parentId,
          senderId,
          senderName,
          role,
          narrativeRole,
          content: swipes[sIdx],
          segments: [],
          state: null,
          status: 'complete',
          createdAt: msgTime + sIdx + 1,
          sequenceIndex,
          metadata: { ...metadata, imported_swipe: true } as any
        });
      }
    }

    sequenceIndex++;
  }

  if (lastMainId) {
    repos.chats.setActiveLeaf(chatId, lastMainId);
  }

  const finalChat = repos.chats.get(chatId);
  if (!finalChat) {
    throw new ApiError('internal', 500, 'Failed to retrieve created chat view');
  }
  return {
    id: finalChat.id,
    title: finalChat.title,
    primaryCharacterId: finalChat.primaryCharacterId,
    activePersonaId: finalChat.activePersonaId,
    activeLeafId: finalChat.activeLeafId,
    activeGenerationMessageId: null,
    createdAt: finalChat.createdAt,
    updatedAt: finalChat.updatedAt,
    metadata: finalChat.metadata,
    messageCount: repos.messages.countInChat(finalChat.id)
  };
}

export async function exportJsonlChat(
  chatId: string,
  repos: Repositories
): Promise<{ data: string; contentType: string; filename: string }> {
  const chat = repos.chats.get(chatId);
  if (!chat) {
    throw new ApiError('not_found', 404, `Chat ${chatId} not found`);
  }

  const char = repos.characters.get(chat.primaryCharacterId);
  const persona = repos.personas.get(chat.activePersonaId);
  const userName = persona?.name ?? 'User';
  const charName = char?.name ?? 'Character';

  const header: SillyTavernChatHeader = {
    user_name: userName,
    character_name: charName,
    create_date: chat.createdAt,
    chat_metadata: {
      ...((chat.metadata ?? {}) as Record<string, unknown>),
      title: chat.title
    }
  };

  const lines: string[] = [JSON.stringify(header)];

  if (chat.activeLeafId) {
    const branchMessages = repos.messages.path(chat.activeLeafId);
    for (const msg of branchMessages) {
      const isUser = msg.narrativeRole === 'persona';
      const isSystem = msg.narrativeRole === 'narrator' || Boolean((msg.metadata as any)?.system);

      const siblings = repos.messages.siblings(msg.id);
      const swipeSiblings = siblings.filter((s) => (s.metadata as any)?.imported_swipe === true);

      const allSwipes = [msg.content, ...swipeSiblings.map((s) => s.content)];

      const lineObj: SillyTavernMessageLine = {
        name: msg.senderName || (isUser ? userName : charName),
        is_user: isUser,
        is_system: isSystem,
        send_date: msg.createdAt,
        mes: msg.content,
        extra: msg.metadata ?? {},
        swipes: allSwipes.length > 1 ? allSwipes : [msg.content],
        swipe_id: 0
      };

      lines.push(JSON.stringify(lineObj));
    }
  }

  const output = lines.join('\n') + '\n';
  return {
    data: output,
    contentType: 'application/octet-stream',
    filename: `chat-${slugify(chat.title || 'export')}-${chat.id.slice(-6)}.jsonl`
  };
}

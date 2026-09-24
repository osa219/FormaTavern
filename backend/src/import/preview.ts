import {
  DEFAULT_CHARACTER_THEME,
  normalizeTag,
  pruneAlternateGreetings,
  validate,
  CharacterCreateSchema,
  type CharacterCreate,
  type ImportPreview
} from '@formatavern/shared';
import { ApiError } from '../engine/errors';
import { isPng } from './v2/png';
import { parseV2Card, type TavernCardV2Data } from './v2/service';

const SHOWCASE_MAX = 65_536;

function buildV2PreviewCard(v2Data: TavernCardV2Data): { card: CharacterCreate; warnings: string[] } {
  const warnings: string[] = [];
  const name = (v2Data.name?.trim() || 'Unnamed Character').slice(0, 120);
  const alternateGreetings = pruneAlternateGreetings(v2Data.alternate_greetings);

  const tags: string[] = [];
  for (const t of v2Data.tags ?? []) {
    if (tags.length >= 12) break;
    const norm = normalizeTag(t);
    if (norm && !tags.includes(norm)) tags.push(norm);
  }

  const card: CharacterCreate = {
    name,
    description: v2Data.description ?? '',
    personality: v2Data.personality ?? '',
    scenario: v2Data.scenario ?? '',
    firstMessage: v2Data.first_mes ?? '',
    alternateGreetings: alternateGreetings.length > 0 ? alternateGreetings : undefined,
    exampleDialogue: v2Data.mes_example ? v2Data.mes_example : undefined,
    creator: v2Data.creator ? v2Data.creator.slice(0, 80) : undefined,
    version: v2Data.character_version ? v2Data.character_version.slice(0, 32) : undefined,
    tags,
    style: DEFAULT_CHARACTER_THEME
  };
  // Note: prompt-instruction extras (system_prompt et al.) are intentionally
  // omitted — Studio drafts do not carry metadata, and reviewed imports are
  // adopted as native cards on save.
  return { card, warnings };
}

function buildCeCharacterPreview(raw: Record<string, any>): { card: CharacterCreate; warnings: string[] } {
  const warnings: string[] = [];
  const cardTitle = typeof raw.card_title === 'string' ? raw.card_title.trim() : '';
  const chatName = typeof raw.chat_name === 'string' ? raw.chat_name.trim() : '';
  if (!cardTitle) warnings.push('Source is missing card_title; a placeholder name is used.');
  if (!chatName) warnings.push('Source is missing chat_name; the card title is used for {{char}}.');

  const showcaseParts: string[] = [];
  if (typeof raw.description === 'string' && raw.description.trim()) {
    showcaseParts.push(raw.description.trim());
  }
  if (typeof raw.creator_notes === 'string' && raw.creator_notes.trim()) {
    showcaseParts.push(`<details><summary>Author notes</summary>\n\n${raw.creator_notes.trim()}\n</details>`);
  }
  let showcase: string | undefined = showcaseParts.length > 0 ? showcaseParts.join('\n\n') : undefined;
  if (showcase && showcase.length > SHOWCASE_MAX) {
    showcase = showcase.slice(0, SHOWCASE_MAX);
    warnings.push('Showcase blurb exceeds 65,536 characters and was truncated.');
  }

  const tags: string[] = [];
  for (const t of Array.isArray(raw.tags) ? raw.tags : []) {
    if (tags.length >= 12) break;
    if (typeof t !== 'string') continue;
    const norm = normalizeTag(t);
    if (norm && !tags.includes(norm)) tags.push(norm);
  }
  const tagsRaw = Array.isArray(raw.tags) ? raw.tags.filter((t: unknown) => typeof t === 'string') : [];

  const alternates = pruneAlternateGreetings(raw.alternate_greetings);

  const card: CharacterCreate = {
    name: (cardTitle || 'Untitled').slice(0, 120),
    characterName: chatName || undefined,
    description: '',
    personality: typeof raw.personality === 'string' ? raw.personality : '',
    scenario: typeof raw.scenario === 'string' ? raw.scenario : '',
    firstMessage: typeof raw.first_message === 'string' ? raw.first_message : '',
    alternateGreetings: alternates.length > 0 ? alternates : undefined,
    exampleDialogue: typeof raw.mes_example === 'string' && raw.mes_example ? raw.mes_example : undefined,
    creator: typeof raw.creator_name === 'string' ? raw.creator_name.slice(0, 80) : undefined,
    creatorUrl: typeof raw.creator_url === 'string' ? raw.creator_url : undefined,
    characterUrl: typeof raw.character_url === 'string' ? raw.character_url : undefined,
    tags,
    style: DEFAULT_CHARACTER_THEME,
    showcase,
    metadata: {
      import: {
        origin: 'custom_engine',
        originId: typeof raw.id === 'string' ? raw.id : undefined,
        tagsRaw
      }
    }
  };
  if (raw.avatar_hash) {
    warnings.push('Avatar is not staged in preview — add one in Studio before saving.');
  }
  return { card, warnings };
}

function summarizeJsonlChat(text: string): { title: string; messageCount: number } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new ApiError('unsupported_format', 422, 'JSONL chat file is empty');
  }
  let startIndex = 0;
  let title = 'Imported chat';
  try {
    const line0 = JSON.parse(lines[0]);
    if (line0 && typeof line0 === 'object' && (line0.user_name || line0.character_name || line0.chat_metadata)) {
      startIndex = 1;
      const meta = (line0.chat_metadata ?? {}) as Record<string, unknown>;
      if (typeof meta.title === 'string' && meta.title.trim()) title = meta.title.trim();
      else if (typeof meta.chat_title === 'string' && meta.chat_title.trim()) title = meta.chat_title.trim();
      else if (typeof line0.character_name === 'string' && line0.character_name.trim()) {
        title = `Chat with ${line0.character_name.trim()}`;
      }
    }
  } catch {
    throw new ApiError('unsupported_format', 422, 'Invalid JSON in line 0 of JSONL');
  }
  let messageCount = 0;
  for (let i = startIndex; i < lines.length; i++) {
    try {
      JSON.parse(lines[i]);
      messageCount++;
    } catch {
      // Malformed lines are skipped on import; excluded from the count.
    }
  }
  return { title, messageCount };
}

function assertPreviewCard(card: CharacterCreate): void {
  const result = validate(CharacterCreateSchema, card);
  if (!result.ok) {
    const first = result.issues?.[0];
    throw new ApiError(
      'validation_failed',
      422,
      `Parsed card failed validation${first ? ` at ${first.path}: ${first.message}` : ''}`
    );
  }
}

/**
 * Parses an uploaded import file without writing anything to the database.
 * Used by the UI to review payloads (Studio draft / confirm dialog) before
 * committing through the real import endpoints.
 */
export function previewImportFile(fileBytes: Uint8Array, filename: string): ImportPreview {
  const lowerName = (filename || '').toLowerCase();
  const text = (() => {
    try {
      return Buffer.from(fileBytes).toString('utf8');
    } catch {
      return null;
    }
  })();

  // 1. PNG → TavernCard V2 carrier
  if (isPng(fileBytes)) {
    const { v2Data, avatarBytes } = parseV2Card(fileBytes);
    const { card, warnings } = buildV2PreviewCard(v2Data);
    assertPreviewCard(card);
    let avatarDataUrl: string | undefined;
    if (avatarBytes) {
      avatarDataUrl = `data:image/png;base64,${Buffer.from(avatarBytes).toString('base64')}`;
    } else {
      warnings.push('No avatar image found — add one in Studio before saving.');
    }
    return { kind: 'character', format: 'tavern-v2', card: card as unknown as Record<string, unknown>, avatarDataUrl, warnings };
  }

  // 2. Whole-file JSON → V2 / custom_engine character / custom_engine chat
  if (text) {
    try {
      const parsed = JSON.parse(text) as Record<string, any>;
      if (parsed && typeof parsed === 'object') {
        // TavernCard V2 (spec envelope or bare V2 data with a name)
        if (
          typeof parsed.spec === 'string' ||
          (typeof parsed.name === 'string' && (parsed.first_mes !== undefined || parsed.description !== undefined))
        ) {
          const v2Data = (parsed.data ?? parsed) as TavernCardV2Data;
          if (!v2Data || typeof v2Data !== 'object') {
            throw new ApiError('unsupported_format', 422, 'Invalid TavernCard V2 payload structure');
          }
          const { card, warnings } = buildV2PreviewCard(v2Data);
          assertPreviewCard(card);
          warnings.push('JSON cards carry no avatar image — add one in Studio before saving.');
          return { kind: 'character', format: 'tavern-v2', card: card as unknown as Record<string, unknown>, warnings };
        }
        // custom_engine character (listing identity + persona name)
        if (typeof parsed.card_title === 'string' && typeof parsed.chat_name === 'string') {
          const { card, warnings } = buildCeCharacterPreview(parsed);
          assertPreviewCard(card);
          return { kind: 'character', format: 'custom-engine', card: card as unknown as Record<string, unknown>, warnings };
        }
        // custom_engine chat
        if (typeof parsed.character_id === 'string' && Array.isArray(parsed.messages)) {
          const messages = parsed.messages as unknown[];
          return {
            kind: 'chat',
            format: 'custom-engine-chat',
            title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Imported chat',
            messageCount: messages.length,
            warnings: []
          };
        }
      }
    } catch (err: any) {
      if (err instanceof ApiError) throw err;
      // Not whole-file JSON — fall through to JSONL below.
    }
  }

  // 3. JSONL chat transcript (SillyTavern)
  if (text && (lowerName.endsWith('.jsonl') || text.includes('\n'))) {
    const { title, messageCount } = summarizeJsonlChat(text);
    return { kind: 'chat', format: 'sillytavern-jsonl', title, messageCount, warnings: [] };
  }

  throw new ApiError(
    'unsupported_format',
    422,
    'Unsupported import file. Expected a TavernCard V2 PNG/JSON, a custom_engine character or chat JSON, or a SillyTavern JSONL transcript.'
  );
}

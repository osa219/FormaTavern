import type { QuarantinedChat, SyncReport } from '@formatavern/shared';

export interface CustomEngineTokenCounts {
  personality_tokens?: number;
  scenario_tokens?: number;
  example_dialog_tokens?: number;
  first_message_tokens?: number;
  total_tokens?: number;
  [key: string]: unknown;
}

export interface CustomEngineCharacter {
  id: string; // UUID
  // Distinct listing identity → FormaTavern card name (slug source).
  card_title: string;
  // Canonical in-universe persona name → FormaTavern character_name ({{char}}).
  chat_name: string;
  avatar_hash?: string | null;
  description: string;
  personality: string;
  scenario: string;
  first_message: string;
  alternate_greetings?: string[];
  mes_example?: string | null;
  creator_name?: string | null;
  creator_id?: string | null;
  creator_url?: string | null;
  character_url?: string | null;
  source_platform?: string | null;
  creator_notes?: string | null;
  tags?: string[];
  soundcloud_track_id?: string | null;
  token_counts?: CustomEngineTokenCounts | null;
  is_nsfw?: boolean;
  is_image_nsfw?: boolean;
  stats?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CustomEngineUserPersona {
  name?: string | null;
  description?: string | null;
  avatar?: string | null;
  pronouns?: string | null;
}

export interface CustomEngineMessage {
  id: string; // e.g. "1566553883_0"
  chat_id: string;
  sequence_index: number;
  role: 'user' | 'assistant' | 'system';
  sender_name?: string | null;
  content: string;
  media_hashes?: string[];
  timestamp?: number | null;
  is_main?: boolean;
  alternate_swipes?: string[];
}

export interface CustomEngineChat {
  id: string; // e.g. "1566553883"
  character_id: string; // UUID of character
  title?: string | null;
  active_greeting_index?: number | null;
  user_persona?: CustomEngineUserPersona | null;
  summary?: string | null;
  fork_source_chat_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  messages: CustomEngineMessage[];
}

export interface CustomEngineManifestMedia {
  hash: string;
  mime_type: string;
  file_extension: string;
  size_bytes: number;
  relative_path: string;
}

export interface CustomEngineManifest {
  version?: string;
  export_timestamp?: string;
  counts?: {
    characters?: number;
    chats?: number;
    media?: number;
  };
  media_assets?: CustomEngineManifestMedia[];
}

export interface CustomEngineImportOptions {
  root?: string;
  file?: string;
  limit?: number;
  characterOriginId?: string;
  dryRun?: boolean;
  batchSize?: number; // default 500
}

export interface PlannedCharacter {
  file: string;
  data: CustomEngineCharacter;
  originHash: string;
  action: 'insert' | 'update' | 'skip';
  existingId?: string; // existing slug
}

export interface PlannedChat {
  file: string;
  data: CustomEngineChat;
  originHash: string;
  action: 'insert' | 'append' | 'header_update' | 'skip' | 'quarantine';
  existingId?: string; // existing short chat id
  existingLeafId?: string | null;
  messagesToInsert: CustomEngineMessage[];
  quarantineReason?: string;
}

export interface SyncPlan {
  characters: PlannedCharacter[];
  chats: PlannedChat[];
  quarantinedChats: QuarantinedChat[];
  scanned: number;
  skipped: number;
  toInsertChars: number;
  toUpdateChars: number;
  toInsertChats: number;
  toAppendChats: number;
}

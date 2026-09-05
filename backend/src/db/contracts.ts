import type {
  CharacterCard,
  Persona,
  LLMProvider,
  ChatMetadata,
  Segment,
  StateVector,
  MessageRole,
  NarrativeRole,
  MessageStatus,
  MessageMetrics,
  MessageMetadata,
  AppSettings,
  SettingsPatch
} from '@formatavern/shared';

export interface CharacterRepository {
  list(): CharacterCard[];
  get(id: string): CharacterCard | null;
  upsert(card: CharacterCard): void;
  insertIfAbsent(card: CharacterCard): boolean;
  remove(id: string): void;
  count(): number;
}

export interface PersonaRepository {
  list(): Persona[];
  get(id: string): Persona | null;
  getDefault(): Persona | null;
  upsert(persona: Persona): void;
  insertIfAbsent(persona: Persona): boolean;
  remove(id: string): void;
  count(): number;
}

export interface ChatRow {
  id: string;
  title: string;
  primaryCharacterId: string;
  activePersonaId: string;
  activeLeafId: string | null;
  createdAt: number;
  updatedAt: number;
  metadata: ChatMetadata;
}

export interface MessageRow {
  id: string;
  chatId: string;
  parentId: string | null;
  senderId: string | null;
  senderName: string | null;
  role: MessageRole;
  narrativeRole: NarrativeRole;
  content: string;
  segments: Segment[];
  state: StateVector | null;
  status: MessageStatus;
  createdAt: number;
  metrics: MessageMetrics | null;
  metadata: MessageMetadata;
}

export interface MessageWithTree extends MessageRow {
  siblingIndex: number;
  siblingCount: number;
  hasChildren: boolean;
}

export interface ChatRepository {
  create(input: {
    id: string;
    title: string;
    primaryCharacterId: string;
    activePersonaId: string;
    metadata: ChatMetadata;
  }): ChatRow;
  get(id: string): ChatRow | null;
  list(): Array<ChatRow & { messageCount: number }>;
  update(
    id: string,
    patch: {
      title?: string;
      activePersonaId?: string;
      activeLeafId?: string | null;
      metadata?: ChatMetadata;
      updatedAt?: number;
    }
  ): ChatRow;
  setActiveLeaf(id: string, leafId: string | null): void;
  remove(id: string): void;
  count(): number;
}

export interface MessageInsertInput {
  id: string;
  chatId: string;
  parentId: string | null;
  role: MessageRole;
  narrativeRole: NarrativeRole;
  content: string;
  senderId?: string | null;
  senderName?: string | null;
  segments?: Segment[];
  state?: StateVector | null;
  status?: MessageStatus;
  metrics?: MessageMetrics | null;
  metadata?: MessageMetadata;
  createdAt?: number;
}

export interface MessageRepository {
  insert(row: MessageInsertInput): MessageRow;
  get(id: string): MessageWithTree | null;
  path(leafId: string): MessageRow[];
  children(id: string): MessageRow[];
  siblings(id: string): MessageRow[];
  descendLatest(id: string): string;
  pageActiveBranch(
    chatId: string,
    leafId: string,
    opts: { before?: string; limit: number }
  ): MessageWithTree[];
  countInChat(chatId: string): number;
  updateStreaming(id: string, patch: { content: string; segments: Segment[] }): void;
  finalize(
    id: string,
    patch: {
      content: string;
      segments: Segment[];
      state: StateVector | null;
      status: MessageStatus;
      metrics: MessageMetrics | null;
      metadata: MessageMetadata;
    }
  ): void;
  updateContent(
    id: string,
    patch: {
      content: string;
      segments: Segment[];
      state?: StateVector | null;
      metadata: MessageMetadata;
    }
  ): void;
  updateState(id: string, state: StateVector, metadata: MessageMetadata): void;
  reopenForContinue(id: string, content: string): void;
  remove(id: string): void;
  markStaleStreamingAsAborted(): string[];
}

export interface SettingsRepository {
  getAll(): AppSettings;
  patch(p: SettingsPatch): AppSettings;
  getRaw(key: string): string | null;
}

export interface Repositories {
  characters: CharacterRepository;
  personas: PersonaRepository;
  chats: ChatRepository;
  messages: MessageRepository;
  settings: SettingsRepository;
  schemaVersion(): number;
  transaction<T>(fn: () => T): T;
}

export interface AppDeps {
  repos: Repositories;
  providers: {
    mock: LLMProvider;
    openrouter?: LLMProvider;
  };
}

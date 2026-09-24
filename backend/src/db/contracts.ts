import type {
  CharacterCard,
  CharacterSummary,
  CharacterCreate,
  CharacterPatch,
  CharacterListQuery,
  Persona,
  PersonaCreate,
  PersonaPatch,
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
  SettingsPatch,
  ShellTheme,
  ProviderConfig,
  ProviderConfigCreate,
  ProviderConfigPatch,
  ChatHubQuery,
  ChatHubResponse
} from '@formatavern/shared';

export interface CharacterRepository {
  list(q?: CharacterListQuery): { items: CharacterSummary[]; nextCursor: string | null };
  get(id: string): CharacterCard | null;
  create(input: CharacterCreate): CharacterCard;
  patch(id: string, input: CharacterPatch): CharacterCard | 'stale' | 'missing';
  remove(id: string, opts?: { cascadeChats?: boolean }): { chats: number } | 'restricted';
  duplicate(id: string): CharacterCard;
  chatCounts(id: string): { chats: number };
  popularTags(limit?: number): Array<{ tag: string; count: number }>;
  tags(): { tag: string; count: number }[];
  findByProvenance(origin: string, originId: string): CharacterCard | null;
  upsert(card: CharacterCard): void;
  insertIfAbsent(card: CharacterCard): boolean;
  count(): number;
}

export interface PersonaRepository {
  list(): Persona[];
  get(id: string): Persona | null;
  getDefault(): Persona | null;
  create(input: PersonaCreate): Persona;
  patch(id: string, input: PersonaPatch): Persona | 'stale' | 'missing';
  setDefault(id: string): Persona[];
  remove(id: string, opts?: { reassignTo?: string }): { chats: number } | 'restricted' | 'is_default';
  chatCounts(id: string): { chats: number };
  upsert(persona: Persona): void;
  insertIfAbsent(persona: Persona): boolean;
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
  origin?: string;
  originId?: string | null;
  originHash?: string | null;
  activeGreetingIndex?: number;
  personaSnapshot?: string | null;
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
  originId?: string | null;
  sequenceIndex?: number | null;
  missingAssets?: string | null;
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
    metadata?: ChatMetadata;
    origin?: string;
    originId?: string | null;
    originHash?: string | null;
    activeGreetingIndex?: number;
    personaSnapshot?: string | null;
  }): ChatRow;
  get(id: string): ChatRow | null;
  findByProvenance(origin: string, originId: string): ChatRow | null;
  list(opts?: { characterId?: string; limit?: number; cursor?: string }): Array<ChatRow & { messageCount: number; turnCount: number }>;
  update(
    id: string,
    patch: {
      title?: string;
      activePersonaId?: string;
      activeLeafId?: string | null;
      metadata?: ChatMetadata;
      updatedAt?: number;
      activeGreetingIndex?: number;
      personaSnapshot?: string | null;
    }
  ): ChatRow;
  setActiveLeaf(id: string, leafId: string | null): void;
  remove(id: string): void;
  removeByCharacter(characterId: string): { deleted: number };
  hub(opts?: ChatHubQuery): ChatHubResponse;
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
  originId?: string | null;
  sequenceIndex?: number | null;
  missingAssets?: string | null;
}

export interface MessageRepository {
  insert(row: MessageInsertInput): MessageRow;
  get(id: string): MessageWithTree | null;
  getMaxSequenceIndex(chatId: string): number;
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
  listInChat(chatId: string): MessageRow[];
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
  getShellTheme(): ShellTheme;
  putShellTheme(doc: ShellTheme): ShellTheme;
}

export interface ProviderConfigRepository {
  list(): ProviderConfig[];
  get(id: string): ProviderConfig | null;
  count(): number;
  create(input: ProviderConfigCreate): ProviderConfig | 'name_taken';
  patch(id: string, input: ProviderConfigPatch): ProviderConfig | 'missing' | 'name_taken';
  remove(id: string): boolean;
}

export interface AssetRecord {
  id: string; // full 64-char lowercase sha256
  mime: string; // image/png | image/jpeg | image/webp | image/gif
  ext: string; // .png | .jpg | .webp | .gif
  size: number;
  width: number;
  height: number;
  path: string; // '/assets/pool/<id>.<ext>'
  createdAt: number;
}

export type CharacterAssetRole = 'avatar' | 'gallery' | 'sprite' | 'greeting' | 'background';

export interface CharacterAssetRecord {
  id: string;
  characterId: string;
  assetId: string;
  role: CharacterAssetRole;
  label?: string | null;
  sortOrder: number;
  createdAt: number;
}

export interface AssetRepository {
  get(id: string): AssetRecord | null;
  has(id: string): boolean;
  insert(asset: AssetRecord): void;
  count(): number;
  list(opts?: { limit?: number; offset?: number }): AssetRecord[];
  delete(id: string): boolean;
  bindCharacterAsset(binding: CharacterAssetRecord): void;
  getCharacterAssets(characterId: string, role?: CharacterAssetRole): CharacterAssetRecord[];
  deleteCharacterAssets(characterId: string, role?: CharacterAssetRole): void;
  bindMessageAsset(messageId: string, assetId: string): void;
  getMessageAssets(messageId: string): string[];
}

export interface Repositories {
  characters: CharacterRepository;
  personas: PersonaRepository;
  chats: ChatRepository;
  messages: MessageRepository;
  settings: SettingsRepository;
  providerConfigs: ProviderConfigRepository;
  assets: AssetRepository;
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

export const SHARED_VERSION = '0.7.2-chats-hub';

export interface HealthResponse {
  ok: true;
  service: 'formatavern-backend';
  sharedVersion: string;
  timestamp: number;
  db: {
    schemaVersion: number;
    characters: number;
    personas: number;
  };
  activeGenerations?: number;
}

export * from './schemas/primitives';
export * from './schemas/theme';
export * from './schemas/state';
export * from './schemas/character';
export * from './schemas/layout';
export * from './schemas/persona';
export * from './schemas/narrative';
export * from './schemas/api';
export * from './schemas/chat';
export * from './schemas/message';
export * from './schemas/settings';
export * from './schemas/providerConfig';
export * from './schemas/shellTheme';
export * from './types/llm';
export * from './types/chatStream';
export * from './validate';
export * from './envelope';
export * from './state/engine';
export * from './text/macros';
export * from './text/stop';
export * from './text/tags';
export * from './text/slug';
export * from './fixtures/stream';
export * from './fixtures/envelope';
export * from './theme';
export * from './hooks/manifest';
export * from './layout/resolve';
export * from './layout/presets';
export * from './customCss/partition';

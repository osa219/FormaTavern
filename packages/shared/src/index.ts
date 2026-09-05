export const SHARED_VERSION = '0.3.0-phase3';

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
export * from './schemas/persona';
export * from './schemas/narrative';
export * from './schemas/api';
export * from './schemas/chat';
export * from './schemas/message';
export * from './schemas/settings';
export * from './types/llm';
export * from './types/chatStream';
export * from './validate';
export * from './envelope';
export * from './state/engine';
export * from './text/macros';
export * from './text/stop';
export * from './fixtures/stream';
export * from './fixtures/envelope';

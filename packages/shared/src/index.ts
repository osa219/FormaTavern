export const SHARED_VERSION = '0.1.0-phase1';

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
}

export * from './schemas/primitives';
export * from './schemas/theme';
export * from './schemas/state';
export * from './schemas/character';
export * from './schemas/persona';
export * from './schemas/narrative';
export * from './types/llm';
export * from './validate';
export * from './fixtures';

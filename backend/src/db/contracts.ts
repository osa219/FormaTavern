import type { CharacterCard, Persona, LLMProvider } from '@formatavern/shared';

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

export interface Repositories {
  characters: CharacterRepository;
  personas: PersonaRepository;
  schemaVersion(): number;
}

export interface AppDeps {
  repos: Repositories;
  providers: {
    mock: LLMProvider;
    openrouter?: LLMProvider;
  };
}

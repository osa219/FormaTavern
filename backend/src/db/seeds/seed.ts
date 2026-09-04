import type { Repositories } from '../contracts';
import { seedCharacters } from './characters';
import { seedPersonas } from './personas';

export interface SeedOptions {
  force?: boolean;
}

export interface SeedResult {
  seeded: boolean;
  characters: number;
  personas: number;
}

export function seed(repos: Repositories, options: SeedOptions = {}): SeedResult {
  const force = options.force ?? false;

  if (!force && repos.characters.count() > 0) {
    return {
      seeded: false,
      characters: repos.characters.count(),
      personas: repos.personas.count()
    };
  }

  for (const char of seedCharacters) {
    if (force) {
      repos.characters.upsert(char);
    } else {
      repos.characters.insertIfAbsent(char);
    }
  }

  for (const persona of seedPersonas) {
    if (force) {
      repos.personas.upsert(persona);
    } else {
      repos.personas.insertIfAbsent(persona);
    }
  }

  return {
    seeded: true,
    characters: repos.characters.count(),
    personas: repos.personas.count()
  };
}

import type { Database } from 'bun:sqlite';
import { openDatabase } from '../../src/db/connection';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { seed } from '../../src/db/seeds/seed';
import { GenerationHubImpl } from '../../src/engine/hub';
import { ProviderRegistryImpl } from '../../src/engine/providers';
import { MockLLMProvider } from '../../src/providers/mock';
import { createApp, type App } from '../../src/app';
import type { Repositories } from '../../src/db/contracts';

export interface TestContext {
  db: Database;
  repos: Repositories;
  hub: GenerationHubImpl;
  providers: ProviderRegistryImpl;
  mockProvider: MockLLMProvider;
  app: App;
}

export function setupTestApp(options: {
  nodeEnv?: string;
  customFetch?: any;
  mockIntervalMs?: number;
  mockPrefill?: boolean;
} = {}): TestContext {
  const db = openDatabase(':memory:');
  runMigrations(db);
  const repos = createRepositories(db);
  seed(repos);

  const hub = new GenerationHubImpl();
  const mockProvider = new MockLLMProvider({
    intervalMs: options.mockIntervalMs ?? 5
  });
  if (options.mockPrefill !== undefined) {
    mockProvider.capabilities.prefill = options.mockPrefill;
  }
  const providers = new ProviderRegistryImpl({
    mockProvider,
    customFetch: options.customFetch
  });

  const app = createApp({
    repos,
    hub,
    providers,
    options: {
      nodeEnv: options.nodeEnv
    }
  });

  return {
    db,
    repos,
    hub,
    providers,
    mockProvider,
    app
  };
}

export async function readSseEvents<T>(
  response: Response,
  cb?: (ev: T) => void
): Promise<T[]> {
  if (!response.body) return [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  const events: T[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const frameText = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const data = frameText
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data) {
        const parsed = JSON.parse(data) as T;
        events.push(parsed);
        cb?.(parsed);
      }
    }
  }
  return events;
}

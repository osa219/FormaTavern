import { describe, it, expect } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'yaml';
import { validate } from '@formatavern/shared';
import { ServerConfigSchema, DEFAULT_SERVER_CONFIG } from '../../src/config/schema';

describe('config.example.yaml parity test (Invariant N3)', () => {
  const examplePath = resolve(import.meta.dir, '../../../config.example.yaml');

  it('exists at repository root and is valid YAML', () => {
    expect(existsSync(examplePath)).toBe(true);
    const content = readFileSync(examplePath, 'utf-8');
    const parsed = yaml.parse(content);
    expect(parsed).toBeDefined();
    expect(typeof parsed).toBe('object');
  });

  it('parses cleanly against ServerConfigSchema without validation errors', () => {
    const content = readFileSync(examplePath, 'utf-8');
    const parsed = yaml.parse(content);
    const result = validate(ServerConfigSchema, parsed);
    expect(result.ok).toBe(true);
  });

  it('contains every section defined in DEFAULT_SERVER_CONFIG', () => {
    const content = readFileSync(examplePath, 'utf-8');
    const parsed = yaml.parse(content);

    for (const section of Object.keys(DEFAULT_SERVER_CONFIG)) {
      expect(parsed).toHaveProperty(section);
    }
  });
});

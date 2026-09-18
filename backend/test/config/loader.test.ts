import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadServerConfig } from '../../src/config/loader';
import { DEFAULT_SERVER_CONFIG } from '../../src/config/schema';

describe('loadServerConfig (Invariants N1–N3)', () => {
  const tmpConfigPath = resolve(import.meta.dir, 'test-config.tmp.yaml');

  afterEach(() => {
    if (existsSync(tmpConfigPath)) {
      unlinkSync(tmpConfigPath);
    }
  });

  it('boots with complete DEFAULT_SERVER_CONFIG when config file is missing', () => {
    const { config, warnings, sourceMap } = loadServerConfig({
      configPath: tmpConfigPath,
      argv: [],
      env: {}
    });

    expect(config).toEqual(DEFAULT_SERVER_CONFIG);
    expect(warnings).toEqual([]);
    expect(sourceMap['network.mode']).toBe('default');
    expect(sourceMap['network.port']).toBe('default');
    expect(sourceMap['security.authMode']).toBe('default');
  });

  it('applies partial file values and fills missing defaults in memory without file mutation (N1)', () => {
    const yamlContent = `
network:
  mode: lan
  port: 4000
`;
    writeFileSync(tmpConfigPath, yamlContent, 'utf-8');

    const { config, warnings, sourceMap } = loadServerConfig({
      configPath: tmpConfigPath,
      argv: [],
      env: {}
    });

    expect(config.network.mode).toBe('lan');
    expect(config.network.port).toBe(4000);
    expect(config.network.qrCode).toBe(true); // defaulted
    expect(config.security.authMode).toBe('none'); // defaulted
    expect(warnings).toEqual([]);
    expect(sourceMap['network.mode']).toBe('file');
    expect(sourceMap['network.port']).toBe('file');
    expect(sourceMap['network.qrCode']).toBe('default');

    // N1 Invariant: File on disk must remain strictly byte-identical
    const contentAfter = readFileSync(tmpConfigPath, 'utf-8');
    expect(contentAfter).toBe(yamlContent);
  });

  it('detects unknown/misspelled keys via pre-clean diff and emits non-fatal warnings (N3)', () => {
    const yamlContent = `
netwrok:
  mode: lan
network:
  unknownField: 123
`;
    writeFileSync(tmpConfigPath, yamlContent, 'utf-8');

    const { config, warnings } = loadServerConfig({
      configPath: tmpConfigPath,
      argv: [],
      env: {}
    });

    expect(config.network.mode).toBe('localhost'); // default, because 'netwrok' was misspelled
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(warnings.some((w) => w.includes('Unknown key "netwrok"'))).toBe(true);
    expect(warnings.some((w) => w.includes('Unknown key "network.unknownField"'))).toBe(true);
  });

  it('throws fatal error on YAML syntax error', () => {
    writeFileSync(tmpConfigPath, 'network:\n  mode: [unclosed', 'utf-8');

    expect(() => {
      loadServerConfig({ configPath: tmpConfigPath, argv: [], env: {} });
    }).toThrow('[config] Failed to parse YAML');
  });

  it('enforces precedence: CLI > Env > File > Defaults (N2)', () => {
    writeFileSync(
      tmpConfigPath,
      `
network:
  port: 4000
`,
      'utf-8'
    );

    // 1. File wins over default
    const res1 = loadServerConfig({ configPath: tmpConfigPath, argv: [], env: {} });
    expect(res1.config.network.port).toBe(4000);
    expect(res1.sourceMap['network.port']).toBe('file');

    // 2. Env wins over file
    const res2 = loadServerConfig({
      configPath: tmpConfigPath,
      argv: [],
      env: { FORMATAVERN_PORT: '5000' }
    });
    expect(res2.config.network.port).toBe(5000);
    expect(res2.sourceMap['network.port']).toBe('env');

    // 3. CLI wins over env
    const res3 = loadServerConfig({
      configPath: tmpConfigPath,
      argv: ['--port', '6000'],
      env: { FORMATAVERN_PORT: '5000' }
    });
    expect(res3.config.network.port).toBe(6000);
    expect(res3.sourceMap['network.port']).toBe('cli');
  });

  it('resolves mode-vs-host conflicts (§2.3)', () => {
    // Mode custom without host -> fatal
    expect(() => {
      loadServerConfig({
        configPath: tmpConfigPath,
        argv: [],
        env: { FORMATAVERN_NETWORK_MODE: 'custom' }
      });
    }).toThrow('network.mode is "custom" but network.host is not specified');

    // Mode lan + explicit host -> warns and ignores host
    const lanRes = loadServerConfig({
      configPath: tmpConfigPath,
      argv: ['--lan', '--host', '192.168.1.50'],
      env: {}
    });
    expect(lanRes.config.network.mode).toBe('lan');
    expect(lanRes.config.network.host).toBeUndefined();
    expect(lanRes.warnings.some((w) => w.includes('Mode "lan" ignores network.host'))).toBe(true);

    // Mode localhost + non-localhost host -> warns and overrides to custom
    const localYaml = `network:\n  mode: localhost\n  host: 10.0.0.5\n`;
    writeFileSync(tmpConfigPath, localYaml, 'utf-8');
    const localRes = loadServerConfig({
      configPath: tmpConfigPath,
      argv: [],
      env: {}
    });
    expect(localRes.config.network.mode).toBe('custom');
    expect(localRes.config.network.host).toBe('10.0.0.5');
    expect(localRes.warnings.some((w) => w.includes('overriding mode to "custom"'))).toBe(true);
    unlinkSync(tmpConfigPath);

    // Legacy FORMATAVERN_HOST=0.0.0.0 maps to custom + 0.0.0.0
    const legacyRes = loadServerConfig({
      configPath: tmpConfigPath,
      argv: [],
      env: { FORMATAVERN_HOST: '0.0.0.0' }
    });
    expect(legacyRes.config.network.mode).toBe('custom');
    expect(legacyRes.config.network.host).toBe('0.0.0.0');
    expect(legacyRes.warnings.some((w) => w.includes('FORMATAVERN_HOST=0.0.0.0 maps to mode "custom"'))).toBe(true);
  });

    it('validates cross-field PIN requirements', () => {

    // authMode: pin with missing pin -> throws fatal
    expect(() => {
      loadServerConfig({
        configPath: tmpConfigPath,
        argv: [],
        env: { FORMATAVERN_NETWORK_MODE: 'lan' }
      });
      // Test when pin mode is set directly
      const yaml = `security:\n  authMode: pin\n`;
      writeFileSync(tmpConfigPath, yaml, 'utf-8');
      loadServerConfig({ configPath: tmpConfigPath, argv: [], env: {} });
    }).toThrow('security.authMode is "pin" but security.pin is missing or empty');

    // authMode: pin with short pin (<4 chars) -> throws fatal (caught by TypeBox minLength)
    expect(() => {
      const yaml = `security:\n  authMode: pin\n  pin: "123"\n`;
      writeFileSync(tmpConfigPath, yaml, 'utf-8');
      loadServerConfig({ configPath: tmpConfigPath, argv: [], env: {} });
    }).toThrow(/Expected string length greater or equal to 4/);

    // authMode: pin with valid pin -> passes
    const validPinRes = loadServerConfig({
      configPath: tmpConfigPath,
      argv: ['--pin', 'secret1234'],
      env: {}
    });
    expect(validPinRes.config.security.authMode).toBe('pin');
    expect(validPinRes.config.security.pin).toBe('secret1234');

    // authMode: none with pin set -> warns
    const nonePinYaml = `security:\n  authMode: none\n  pin: "secret1234"\n`;
    writeFileSync(tmpConfigPath, nonePinYaml, 'utf-8');
    const warnRes = loadServerConfig({ configPath: tmpConfigPath, argv: [], env: {} });
    expect(warnRes.warnings.some((w) => w.includes('PIN will not be enforced'))).toBe(true);
  });

  it('honors FORMATAVERN_CONFIG_PATH and defaults to the repo-root config.yaml', () => {
    const yamlContent = `network:\n  port: 4123\n`;
    writeFileSync(tmpConfigPath, yamlContent, 'utf-8');

    const viaEnv = loadServerConfig({ argv: [], env: { FORMATAVERN_CONFIG_PATH: tmpConfigPath } });
    expect(viaEnv.config.network.port).toBe(4123);
    expect(viaEnv.sourceMap['network.port']).toBe('file');

    // Explicit configPath still wins over the env var
    const otherPath = resolve(import.meta.dir, 'test-config-other.tmp.yaml');
    writeFileSync(otherPath, `network:\n  port: 4321\n`, 'utf-8');
    try {
      const viaExplicit = loadServerConfig({
        configPath: otherPath,
        argv: [],
        env: { FORMATAVERN_CONFIG_PATH: tmpConfigPath }
      });
      expect(viaExplicit.config.network.port).toBe(4321);
    } finally {
      if (existsSync(otherPath)) unlinkSync(otherPath);
    }
  });
});

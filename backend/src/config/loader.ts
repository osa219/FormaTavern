import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'yaml';
import { assertValid } from '@formatavern/shared';
import {
  ServerConfigSchema,
  DEFAULT_SERVER_CONFIG,
  checkCrossField,
  type ServerConfig
} from './schema';
import { parseCliArgs, parseEnvArgs, type PartialServerConfig } from './sources';

export type ConfigSource = 'default' | 'file' | 'env' | 'cli';

export interface LoadedConfig {
  config: ServerConfig;
  warnings: string[];
  sourceMap: Record<string, ConfigSource>;
}

export interface LoadConfigOptions {
  configPath?: string;
  argv?: string[];
  env?: Record<string, string | undefined>;
}

// Repo root anchored on this module (backend/src/config/), never on process.cwd():
// `bun run start` executes with cwd=backend/, which must still resolve the root config.yaml.
const REPO_ROOT = resolve(import.meta.dir, '../../..');

const KNOWN_PROPERTIES: Record<string, string[]> = {
  network: ['mode', 'host', 'port', 'qrCode', 'announceLan'],
  security: ['authMode', 'pin', 'trustedProxies'],
  storage: ['dataPath', 'assetsPath'],
  tunnel: ['provider']
};

/**
 * Walks parsed YAML object and collects warnings for unknown/misspelled keys.
 */
function findUnknownKeys(raw: unknown, pathPrefix = ''): string[] {
  const warnings: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return warnings;

  const topKeys = Object.keys(KNOWN_PROPERTIES);

  for (const [key, value] of Object.entries(raw)) {
    const fullPath = pathPrefix ? `${pathPrefix}.${key}` : key;

    if (!pathPrefix) {
      if (!topKeys.includes(key)) {
        warnings.push(`[config] Unknown key "${fullPath}"`);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        const allowedChildren = KNOWN_PROPERTIES[key] || [];
        for (const childKey of Object.keys(value)) {
          if (!allowedChildren.includes(childKey)) {
            warnings.push(`[config] Unknown key "${key}.${childKey}"`);
          }
        }
      }
    }
  }

  return warnings;
}

/**
 * Loads host configuration with precedence:
 * CLI > Environment Variables > config.yaml > Invariant Defaults
 */
export function loadServerConfig(options: LoadConfigOptions = {}): LoadedConfig {
  const warnings: string[] = [];
  const sourceMap: Record<string, ConfigSource> = {};

  // 1. Initialize with explicit defaults
  const merged: any = JSON.parse(JSON.stringify(DEFAULT_SERVER_CONFIG));

  const setSource = (leaf: string, src: ConfigSource) => {
    sourceMap[leaf] = src;
  };

  // Mark defaults in sourceMap
  for (const [sec, val] of Object.entries(DEFAULT_SERVER_CONFIG)) {
    if (typeof val === 'object' && val !== null) {
      for (const k of Object.keys(val)) {
        setSource(`${sec}.${k}`, 'default');
      }
    }
  }

  // 2. Locate & parse config.yaml (explicit path > FORMATAVERN_CONFIG_PATH > repo root; never auto-created)
  const envConfigPath = (options.env ?? process.env).FORMATAVERN_CONFIG_PATH?.trim();
  const filePath =
    options.configPath ?? (envConfigPath ? resolve(envConfigPath) : resolve(REPO_ROOT, 'config.yaml'));
  let fileConfig: any = null;

  if (existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      fileConfig = yaml.parse(content);
    } catch (err: any) {
      throw new Error(`[config] Failed to parse YAML at "${filePath}": ${err.message}`);
    }

    if (fileConfig && typeof fileConfig === 'object') {
      for (const sec of ['network', 'security', 'storage', 'tunnel']) {
        if (fileConfig[sec] === null) {
          fileConfig[sec] = {};
        }
      }

      const unknownWarnings = findUnknownKeys(fileConfig);
      warnings.push(...unknownWarnings.map((w) => `${w} in ${filePath}`));

      // Overlay file values
      if (fileConfig.network && typeof fileConfig.network === 'object') {
        for (const [k, v] of Object.entries(fileConfig.network)) {
          if (v !== undefined) {
            merged.network[k] = v;
            setSource(`network.${k}`, 'file');
          }
        }
      }
      if (fileConfig.security && typeof fileConfig.security === 'object') {
        for (const [k, v] of Object.entries(fileConfig.security)) {
          if (v !== undefined) {
            merged.security[k] = v;
            setSource(`security.${k}`, 'file');
          }
        }
      }
      if (fileConfig.storage && typeof fileConfig.storage === 'object') {
        for (const [k, v] of Object.entries(fileConfig.storage)) {
          if (v !== undefined) {
            merged.storage[k] = v;
            setSource(`storage.${k}`, 'file');
          }
        }
      }
      if (fileConfig.tunnel && typeof fileConfig.tunnel === 'object') {
        for (const [k, v] of Object.entries(fileConfig.tunnel)) {
          if (v !== undefined) {
            merged.tunnel[k] = v;
            setSource(`tunnel.${k}`, 'file');
          }
        }
      }
    }
  }

  // 3. Overlay environment variables
  const envConfig = parseEnvArgs(options.env ?? process.env);
  if (envConfig.network) {
    for (const [k, v] of Object.entries(envConfig.network)) {
      if (v !== undefined) {
        merged.network[k] = v;
        setSource(`network.${k}`, 'env');
      }
    }
  }
  if (envConfig.security) {
    for (const [k, v] of Object.entries(envConfig.security)) {
      if (v !== undefined) {
        merged.security[k] = v;
        setSource(`security.${k}`, 'env');
      }
    }
  }
  if (envConfig.storage) {
    for (const [k, v] of Object.entries(envConfig.storage)) {
      if (v !== undefined) {
        merged.storage[k] = v;
        setSource(`storage.${k}`, 'env');
      }
    }
  }

  // 4. Overlay CLI arguments
  const cliConfig = parseCliArgs(options.argv ?? process.argv.slice(2));
  if (cliConfig.network) {
    for (const [k, v] of Object.entries(cliConfig.network)) {
      if (v !== undefined) {
        merged.network[k] = v;
        setSource(`network.${k}`, 'cli');
      }
    }
  }
  if (cliConfig.security) {
    for (const [k, v] of Object.entries(cliConfig.security)) {
      if (v !== undefined) {
        merged.security[k] = v;
        setSource(`security.${k}`, 'cli');
      }
    }
  }
  if (cliConfig.storage) {
    for (const [k, v] of Object.entries(cliConfig.storage)) {
      if (v !== undefined) {
        merged.storage[k] = v;
        setSource(`storage.${k}`, 'cli');
      }
    }
  }

  // 5. Mode-vs-host resolution (§2.3 step 6)
  const envHost = (options.env ?? process.env).FORMATAVERN_HOST?.trim();
  const rawMode = merged.network.mode;
  const rawHost = merged.network.host;

  if (rawMode === 'lan' && rawHost) {
    warnings.push(`[config] Mode "lan" ignores network.host "${rawHost}" (binding 0.0.0.0).`);
    delete merged.network.host;
  } else if (rawMode === 'localhost' && rawHost && rawHost !== '127.0.0.1' && rawHost !== 'localhost') {
    warnings.push(`[config] network.host "${rawHost}" specified with mode "localhost"; overriding mode to "custom".`);
    merged.network.mode = 'custom';
    setSource('network.mode', sourceMap['network.host'] || 'cli');
  }

  const explicitModeConfigured =
    Boolean(fileConfig?.network?.mode) ||
    Boolean((options.env ?? process.env).FORMATAVERN_NETWORK_MODE) ||
    Boolean(options.argv?.some((a) => a === '--lan' || a.startsWith('--host')));

  if (envHost === '0.0.0.0' && !explicitModeConfigured) {
    warnings.push(
      '[config] FORMATAVERN_HOST=0.0.0.0 maps to mode "custom" with host 0.0.0.0. Consider using FORMATAVERN_NETWORK_MODE=lan.'
    );
  }

  // 6. Validate through TypeBox pipeline
  const validated = assertValid(ServerConfigSchema, merged, 'ServerConfig');

  // 7. Check cross-field rules
  const fatalErrors = checkCrossField(validated);
  if (fatalErrors.length > 0) {
    throw new Error(`[config] ${fatalErrors.join('; ')}`);
  }

  if (validated.security.authMode === 'none' && validated.security.pin) {
    warnings.push('[config] security.pin is set but security.authMode is "none". PIN will not be enforced.');
  }

  return {
    config: validated,
    warnings,
    sourceMap
  };
}

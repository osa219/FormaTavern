export interface PartialServerConfig {
  network?: {
    mode?: 'localhost' | 'lan' | 'custom';
    host?: string;
    port?: number;
    qrCode?: boolean;
    announceLan?: boolean;
  };
  security?: {
    authMode?: 'none' | 'pin';
    pin?: string;
    trustedProxies?: string[];
  };
  storage?: {
    dataPath?: string;
    assetsPath?: string;
  };
  tunnel?: {
    provider?: 'none' | 'cloudflare' | 'tailscale';
  };
}

/**
 * Pure parser for command-line arguments.
 */
export function parseCliArgs(argv: string[]): PartialServerConfig {
  const result: PartialServerConfig = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--lan') {
      result.network = { ...result.network, mode: 'lan' };
    } else if (arg === '--no-qr') {
      result.network = { ...result.network, qrCode: false };
    } else if (arg === '--qr') {
      result.network = { ...result.network, qrCode: true };
    } else if (arg === '--host' || arg.startsWith('--host=')) {
      const val = arg.startsWith('--host=') ? arg.slice(7) : argv[++i];
      if (val && val.trim().length > 0) {
        result.network = {
          ...result.network,
          host: val.trim(),
          mode: result.network?.mode ?? 'custom'
        };
      }
    } else if (arg === '--port' || arg.startsWith('--port=')) {
      const val = arg.startsWith('--port=') ? arg.slice(7) : argv[++i];
      if (val) {
        const parsed = parseInt(val, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
          throw new Error(`Invalid --port value: "${val}". Port must be an integer between 1 and 65535.`);
        }
        result.network = { ...result.network, port: parsed };
      }
    } else if (arg === '--pin' || arg.startsWith('--pin=')) {
      const val = arg.startsWith('--pin=') ? arg.slice(6) : argv[++i];
      if (val !== undefined) {
        result.security = { ...result.security, authMode: 'pin', pin: val };
      }
    }
  }

  return result;
}

/**
 * Pure parser for environment variables.
 */
export function parseEnvArgs(env: Record<string, string | undefined>): PartialServerConfig {
  const result: PartialServerConfig = {};

  const mode = env.FORMATAVERN_NETWORK_MODE?.trim().toLowerCase();
  if (mode === 'localhost' || mode === 'lan' || mode === 'custom') {
    result.network = { ...result.network, mode };
  }

  const host = env.FORMATAVERN_HOST?.trim();
  if (host) {
    // If FORMATAVERN_HOST is 0.0.0.0 and mode is not explicitly specified, treat as custom mode with warning per §2.3
    result.network = { ...result.network, host };
    if (!result.network.mode && host === '0.0.0.0') {
      result.network.mode = 'custom';
    }
  }

  const portStr = env.FORMATAVERN_PORT?.trim();
  if (portStr) {
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid FORMATAVERN_PORT value: "${portStr}". Port must be an integer between 1 and 65535.`);
    }
    result.network = { ...result.network, port };
  }

  const pin = env.FORMATAVERN_PIN;
  if (pin !== undefined && pin.length > 0) {
    result.security = { ...result.security, authMode: 'pin', pin };
  }

  const dbPath = env.FORMATAVERN_DB_PATH?.trim();
  if (dbPath) {
    result.storage = { ...result.storage, dataPath: dbPath };
  }

  const assetsDir = env.FORMATAVERN_ASSETS_DIR?.trim();
  if (assetsDir) {
    result.storage = { ...result.storage, assetsPath: assetsDir };
  }

  const qrStr = env.FORMATAVERN_QR?.trim().toLowerCase();
  if (qrStr === 'false' || qrStr === '0') {
    result.network = { ...result.network, qrCode: false };
  } else if (qrStr === 'true' || qrStr === '1') {
    result.network = { ...result.network, qrCode: true };
  }

  return result;
}

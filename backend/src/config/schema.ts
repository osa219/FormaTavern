import { Type, type Static } from '@formatavern/shared';

export const ServerConfigSchema = Type.Object({
  network: Type.Object({
    mode: Type.Union([
      Type.Literal('localhost'),
      Type.Literal('lan'),
      Type.Literal('custom')
    ], { default: 'localhost' }),
    host: Type.Optional(Type.String({ minLength: 1, maxLength: 253 })),
    port: Type.Integer({ minimum: 1, maximum: 65535, default: 3000 }),
    qrCode: Type.Boolean({ default: true }),
    announceLan: Type.Boolean({ default: true })
  }, { default: {} }),

  security: Type.Object({
    authMode: Type.Union([
      Type.Literal('none'),
      Type.Literal('pin')
    ], { default: 'none' }),
    pin: Type.Optional(Type.String({ minLength: 4, maxLength: 64 })),
    trustedProxies: Type.Array(Type.String(), { default: ['127.0.0.1', '::1'] })
  }, { default: {} }),

  storage: Type.Object({
    dataPath: Type.Optional(Type.String()),
    assetsPath: Type.Optional(Type.String())
  }, { default: {} }),

  tunnel: Type.Object({
    provider: Type.Union([
      Type.Literal('none'),
      Type.Literal('cloudflare'),
      Type.Literal('tailscale')
    ], { default: 'none' })
  }, { default: {} })
}, { default: {} });

export type ServerConfig = Static<typeof ServerConfigSchema>;

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  network: {
    mode: 'localhost',
    port: 3000,
    qrCode: true,
    announceLan: true
  },
  security: {
    authMode: 'none',
    trustedProxies: ['127.0.0.1', '::1']
  },
  storage: {},
  tunnel: {
    provider: 'none'
  }
};

/**
 * Validates cross-field constraints that cannot be expressed purely in static TypeBox schema.
 * Returns an array of fatal error messages (empty if valid).
 */
export function checkCrossField(c: ServerConfig): string[] {
  const errors: string[] = [];

  if (c.security.authMode === 'pin') {
    if (!c.security.pin || c.security.pin.trim().length === 0) {
      errors.push(
        'security.authMode is "pin" but security.pin is missing or empty. Provide a PIN (4-64 characters) via config.yaml, FORMATAVERN_PIN, or --pin.'
      );
    } else if (c.security.pin.length < 4 || c.security.pin.length > 64) {
      errors.push(
        `security.pin must be between 4 and 64 characters (got ${c.security.pin.length}).`
      );
    }
  }

  if (c.network.mode === 'custom') {
    if (!c.network.host || c.network.host.trim().length === 0) {
      errors.push(
        'network.mode is "custom" but network.host is not specified. Provide a target IP or hostname via config.yaml, FORMATAVERN_HOST, or --host.'
      );
    }
  }

  return errors;
}

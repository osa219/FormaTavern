import { describe, it, expect, beforeEach } from 'bun:test';
import { createApp } from '../../src/app';
import { openDatabase } from '../../src/db/connection';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { GenerationHubImpl } from '../../src/engine/hub';
import { ProviderRegistryImpl } from '../../src/engine/providers';
import { createHmacToken, verifyHmacToken, verifyPinTimingSafe, InboundAuditor } from '../../src/routes/auth';

describe('Auth Gate & Route Protection (Invariants N5, N6, N7, N10)', () => {
  let repos: any;
  let hub: any;
  let providers: any;
  const authSecret = new Uint8Array(32);
  authSecret.fill(42);
  const correctPin = '1234';

  beforeEach(() => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    repos = createRepositories(db);
    hub = new GenerationHubImpl();
    providers = new ProviderRegistryImpl(repos.settings);
  });

  function createTestApp(authEnabled: boolean, resolveIpClient: string = '127.0.0.1') {
    return createApp({
      repos,
      hub,
      providers,
      options: {
        nodeEnv: 'test',
        auth: {
          enabled: authEnabled,
          verifyPin: (cand) => verifyPinTimingSafe(cand, correctPin),
          signToken: () => createHmacToken(authSecret),
          verifyToken: (tok) => verifyHmacToken(authSecret, tok),
          trustedProxies: ['127.0.0.1', '::1'],
          rateLimitMaxFails: 3,
          rateLimitWindowMs: 60_000
        },
        resolveIp: () => resolveIpClient
      }
    });
  }

  it('allows all requests when auth is disabled', async () => {
    const app = createTestApp(false, '192.168.1.100');

    // Health is fully unredacted
    const healthRes = await app.handle(new Request('http://localhost/api/health'));
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as any;
    expect(health.ok).toBe(true);
    expect(health.db).toBeDefined();

    // Characters route is accessible
    const charRes = await app.handle(new Request('http://localhost/api/characters'));
    expect(charRes.status).toBe(200);

    // Auth status is none
    const statusRes = await app.handle(new Request('http://localhost/api/auth/status'));
    expect(statusRes.status).toBe(200);
    const status = (await statusRes.json()) as any;
    expect(status.authRequired).toBe('none');
  });

  it('bypasses PIN authentication for local loopback requests', async () => {
    const app = createTestApp(true, '127.0.0.1');

    const charRes = await app.handle(new Request('http://localhost/api/characters'));
    expect(charRes.status).toBe(200);

    const healthRes = await app.handle(new Request('http://localhost/api/health'));
    const health = (await healthRes.json()) as any;
    expect(health.db).toBeDefined();

    const statusRes = await app.handle(new Request('http://localhost/api/auth/status'));
    const status = (await statusRes.json()) as any;
    expect(status.authRequired).toBe('none');
  });

  it('gates unauthenticated LAN requests with 401 auth_required and redacts health', async () => {
    const app = createTestApp(true, '192.168.1.50');

    // Characters gated
    const charRes = await app.handle(new Request('http://localhost/api/characters'));
    expect(charRes.status).toBe(401);
    const charBody = (await charRes.json()) as any;
    expect(charBody.error.code).toBe('auth_required');

    // Chats gated
    const chatRes = await app.handle(new Request('http://localhost/api/chats'));
    expect(chatRes.status).toBe(401);

    // Health is redacted to { ok: true }
    const healthRes = await app.handle(new Request('http://localhost/api/health'));
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as any;
    expect(health).toEqual({ ok: true });

    // Auth status prompts for PIN
    const statusRes = await app.handle(new Request('http://localhost/api/auth/status'));
    expect(statusRes.status).toBe(200);
    const status = (await statusRes.json()) as any;
    expect(status.authRequired).toBe('pin');
  });

  it('strictly ignores spoofed X-Forwarded-For headers from untrusted remote IPs (Invariant N5)', async () => {
    const app = createTestApp(true, '192.168.1.50');

    // Remote attacker tries to claim they are loopback
    const res = await app.handle(
      new Request('http://localhost/api/characters', {
        headers: { 'x-forwarded-for': '127.0.0.1' }
      })
    );
    expect(res.status).toBe(401);
  });

  it('honors X-Forwarded-For when request comes from trusted proxy (Vite dev server) (Invariant N5)', async () => {
    // Direct connection is 127.0.0.1 (trusted proxy), but client on LAN forwarded
    const app = createTestApp(true, '127.0.0.1');

    const res = await app.handle(
      new Request('http://localhost/api/characters', {
        headers: { 'x-forwarded-for': '192.168.1.75' }
      })
    );
    expect(res.status).toBe(401);
  });

  it('handles PIN verification, tokens, and rate limits (Invariant N7)', async () => {
    const app = createTestApp(true, '192.168.1.50');

    // 1. Wrong PIN returns 401 invalid_pin
    const fail1 = await app.handle(
      new Request('http://localhost/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: '0000' })
      })
    );
    expect(fail1.status).toBe(401);
    const fail1Body = (await fail1.json()) as any;
    expect(fail1Body.error.code).toBe('invalid_pin');

    // 2. Consume remaining attempts to trigger rate limit (max 3 in test)
    await app.handle(
      new Request('http://localhost/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: '0000' })
      })
    );
    await app.handle(
      new Request('http://localhost/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: '0000' })
      })
    );

    // 4th attempt must be 429
    const rateLimited = await app.handle(
      new Request('http://localhost/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: correctPin })
      })
    );
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.headers.get('retry-after')).toBe('60');
    const rateBody = (await rateLimited.json()) as any;
    expect(rateBody.error.code).toBe('too_many_requests');
  });

  it('allows access with a valid signed Bearer token', async () => {
    const app = createTestApp(true, '192.168.1.99');

    // Submit correct PIN from clean IP
    const verifyRes = await app.handle(
      new Request('http://localhost/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: correctPin })
      })
    );
    expect(verifyRes.status).toBe(200);
    const { token } = (await verifyRes.json()) as any;
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    // Use token to access gated routes
    const charRes = await app.handle(
      new Request('http://localhost/api/characters', {
        headers: { authorization: `Bearer ${token}` }
      })
    );
    expect(charRes.status).toBe(200);

    // Health is now unredacted
    const healthRes = await app.handle(
      new Request('http://localhost/api/health', {
        headers: { authorization: `Bearer ${token}` }
      })
    );
    const health = (await healthRes.json()) as any;
    expect(health.db).toBeDefined();

    // Invalid or forged token is rejected
    const badRes = await app.handle(
      new Request('http://localhost/api/characters', {
        headers: { authorization: `Bearer ${token}tampered` }
      })
    );
    expect(badRes.status).toBe(401);
  });

  it('asserts every API router is gated behind the auth plugin (Invariant N6 mount order)', async () => {
    const app = createTestApp(true, '192.168.1.50');
    const gatedEndpoints = [
      '/api/characters',
      '/api/tags',
      '/api/personas',
      '/api/settings',
      '/api/provider-configs',
      '/api/chats',
      '/api/assets/upload'
    ];

    for (const ep of gatedEndpoints) {
      const res = await app.handle(
        new Request(`http://localhost${ep}`, {
          method: ep.includes('upload') ? 'POST' : 'GET'
        })
      );
      expect(res.status).toBe(401);
      const body = (await res.json()) as any;
      expect(body.error?.code).toBe('auth_required');
    }
  });

  it('ensures non-API requests (static assets, shell) bypass the auth gate without 401 (Invariant N6)', async () => {
    const auditor = new InboundAuditor();
    let auditBlockedCalled = false;
    auditor.auditBlocked = () => {
      auditBlockedCalled = true;
    };

    const app = createApp({
      repos,
      hub,
      providers,
      options: {
        nodeEnv: 'test',
        auth: {
          enabled: true,
          verifyPin: (cand) => verifyPinTimingSafe(cand, correctPin),
          signToken: () => createHmacToken(authSecret),
          verifyToken: (tok) => verifyHmacToken(authSecret, tok),
          trustedProxies: ['127.0.0.1', '::1']
        },
        resolveIp: () => '192.168.1.50',
        auditor
      }
    });

    // Asset paths return non-401 (unmatched by API router) instead of 401 auth_required
    const assetRes = await app.handle(new Request('http://localhost/assets/avatars/test.webp'));
    expect(assetRes.status).not.toBe(401);
    expect(auditBlockedCalled).toBe(false);

    // Root / shell path returns non-401 through createApp
    const rootRes = await app.handle(new Request('http://localhost/'));
    expect(rootRes.status).not.toBe(401);
    expect(auditBlockedCalled).toBe(false);
  });
});

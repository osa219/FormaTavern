import { describe, it, expect, beforeEach } from 'bun:test';
import { sanitizeUserAgent, InboundAuditor, createHmacToken, verifyHmacToken, verifyPinTimingSafe } from '../../src/routes/auth';
import { createApp } from '../../src/app';
import { openDatabase } from '../../src/db/connection';
import { runMigrations } from '../../src/db/migrate';
import { createRepositories } from '../../src/db/repositories';
import { GenerationHubImpl } from '../../src/engine/hub';
import { ProviderRegistryImpl } from '../../src/engine/providers';

describe('User-Agent Sanitization (sanitizeUserAgent)', () => {
  it('falls back to "unknown-device" on missing, null, empty, or whitespace strings', () => {
    expect(sanitizeUserAgent()).toBe('unknown-device');
    expect(sanitizeUserAgent(undefined)).toBe('unknown-device');
    expect(sanitizeUserAgent(null)).toBe('unknown-device');
    expect(sanitizeUserAgent('')).toBe('unknown-device');
    expect(sanitizeUserAgent('   \t \r\n  ')).toBe('unknown-device');
  });

  it('strips ANSI escape sequences and terminal control codes', () => {
    const colored = '\x1b[31;1mRed Alert\x1b[0m';
    expect(sanitizeUserAgent(colored)).toBe('Red Alert');

    const screenClear = '\x1b[2J\x1b[H';
    expect(sanitizeUserAgent(screenClear)).toBe('unknown-device');

    const oscSequence = '\x1b]0;Pwned Terminal\x07SafeText';
    expect(sanitizeUserAgent(oscSequence)).toBe('SafeText');
  });

  it('strips ASCII control characters and collapses whitespace/newlines', () => {
    const raw = 'Mozilla/5.0 (iPhone;\r\n\tCPU iPhone OS 17_4\x00\x07 like Mac OS X)';
    expect(sanitizeUserAgent(raw)).toBe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)');

    const messyWhitespace = '  Avast   \t\t  Antivirus   Web   Shield  ';
    expect(sanitizeUserAgent(messyWhitespace)).toBe('Avast Antivirus Web Shield');
  });

  it('truncates oversized strings to 100 characters plus an ellipsis (…)', () => {
    const exactly100 = 'A'.repeat(100);
    expect(sanitizeUserAgent(exactly100)).toBe(exactly100);
    expect(sanitizeUserAgent(exactly100).length).toBe(100);

    const string500 = 'B'.repeat(500);
    const truncated = sanitizeUserAgent(string500);
    expect(truncated.length).toBe(101); // 100 chars + 1 ellipsis
    expect(truncated.endsWith('…')).toBe(true);
    expect(truncated.slice(0, 100)).toBe('B'.repeat(100));

    const string99 = 'C'.repeat(99);
    expect(sanitizeUserAgent(string99)).toBe(string99);
  });

  it('preserves authentic User-Agent strings unchanged', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
    expect(sanitizeUserAgent(chrome)).toBe(chrome);

    const avast = 'Avast Antivirus';
    expect(sanitizeUserAgent(avast)).toBe('Avast Antivirus');
  });
});

describe('InboundAuditor Bounded Map & Debouncing (R1, Invariant N5)', () => {
  it('debounces 20 rapid requests from the same IP and UA to 1 log line', () => {
    const auditor = new InboundAuditor(60_000, 200);
    const logged: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logged.push(args.join(' '));

    try {
      for (let i = 0; i < 20; i++) {
        auditor.audit('192.168.1.14', 'GET', '/api/characters', 'Mozilla/5.0 (iPhone)');
      }
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain('Inbound connection from 192.168.1.14 (Mozilla/5.0 (iPhone)) → GET /api/characters');
    } finally {
      console.log = origLog;
    }
  });

  it('differentiates distinct User-Agents from the same IP', () => {
    const auditor = new InboundAuditor(60_000, 200);
    const logged: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logged.push(args.join(' '));

    try {
      auditor.audit('192.168.1.14', 'GET', '/api/characters', 'Mozilla/5.0 (iPhone)');
      auditor.audit('192.168.1.14', 'GET', '/api/characters', 'Mozilla/5.0 (Android)');
      expect(logged.length).toBe(2);
      expect(logged[0]).toContain('(Mozilla/5.0 (iPhone))');
      expect(logged[1]).toContain('(Mozilla/5.0 (Android))');
    } finally {
      console.log = origLog;
    }
  });

  it('strictly caps debounce map to maxEntries and evicts oldest entries FIFO (R1 DoS Defense)', () => {
    const maxEntries = 5;
    const auditor = new InboundAuditor(60_000, maxEntries);
    const logged: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logged.push(args.join(' '));

    try {
      for (let i = 1; i <= 10; i++) {
        auditor.audit(`192.168.1.${i}`, 'GET', '/api/characters', `Client-${i}`);
        expect(auditor.entryCount).toBeLessThanOrEqual(maxEntries);
      }
      expect(auditor.entryCount).toBe(maxEntries);
      expect(logged.length).toBe(10);

      // Now request Client-1 again (which was evicted earlier because maxEntries was 5).
      // Since it was evicted, it should log again!
      auditor.audit('192.168.1.1', 'GET', '/api/characters', 'Client-1');
      expect(logged.length).toBe(11);

      // But requesting Client-10 (which is still in the map) should be debounced!
      auditor.audit('192.168.1.10', 'GET', '/api/characters', 'Client-10');
      expect(logged.length).toBe(11);
    } finally {
      console.log = origLog;
    }
  });

  it('tracks allowed inbound and blocked requests separately', () => {
    const auditor = new InboundAuditor(60_000, 200);
    const logged: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logged.push(args.join(' '));

    try {
      // First, client is blocked
      auditor.auditBlocked('192.168.1.5', 'GET', '/api/chats', 'Avast Antivirus');
      // Rapid repeat is debounced
      auditor.auditBlocked('192.168.1.5', 'GET', '/api/chats', 'Avast Antivirus');
      expect(logged.length).toBe(1);
      expect(logged[0]).toContain('Blocked unauthenticated request from 192.168.1.5 (Avast Antivirus)');

      // Later, client unlocks and connects
      auditor.audit('192.168.1.5', 'GET', '/api/chats', 'Avast Antivirus');
      auditor.audit('192.168.1.5', 'GET', '/api/chats', 'Avast Antivirus');
      expect(logged.length).toBe(2);
      expect(logged[1]).toContain('Inbound connection from 192.168.1.5 (Avast Antivirus)');
    } finally {
      console.log = origLog;
    }
  });

  it('remains completely silent for loopback and unknown IPs', () => {
    const auditor = new InboundAuditor(60_000, 200);
    const logged: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logged.push(args.join(' '));

    try {
      auditor.audit('127.0.0.1', 'GET', '/api/characters', 'Desktop');
      auditor.audit('::1', 'GET', '/api/characters', 'Desktop');
      auditor.audit('unknown', 'GET', '/api/characters', 'Desktop');
      auditor.auditBlocked('127.0.0.1', 'GET', '/api/characters', 'Desktop');
      auditor.auditBlocked('::1', 'GET', '/api/characters', 'Desktop');
      auditor.auditBlocked('unknown', 'GET', '/api/characters', 'Desktop');
      expect(logged.length).toBe(0);
      expect(auditor.entryCount).toBe(0);
    } finally {
      console.log = origLog;
    }
  });
});

describe('Zero-Trust Auth Gate & Diagnostic Inbound Integration (R2, Nits 1 & 2)', () => {
  let repos: any;
  let hub: any;
  let providers: any;
  const authSecret = new Uint8Array(32);
  authSecret.fill(77);
  const correctPin = '4321';

  beforeEach(() => {
    const db = openDatabase(':memory:');
    runMigrations(db);
    repos = createRepositories(db);
    hub = new GenerationHubImpl();
    providers = new ProviderRegistryImpl(repos.settings);
  });

  function createTestApp(auditor: InboundAuditor, remoteIp: string = '127.0.0.1') {
    return createApp({
      repos,
      hub,
      providers,
      options: {
        nodeEnv: 'test',
        auditor,
        auth: {
          enabled: true,
          verifyPin: (cand) => verifyPinTimingSafe(cand, correctPin),
          signToken: () => createHmacToken(authSecret),
          verifyToken: (tok) => verifyHmacToken(authSecret, tok),
          trustedProxies: ['127.0.0.1', '::1']
        },
        resolveIp: () => remoteIp
      }
    });
  }

  it('R2 (Zero-Trust): Spoofed User-Agent without token returns 401 and calls auditBlocked', async () => {
    const auditor = new InboundAuditor();
    let blockedCalled = false;
    let loggedIp = '';
    let loggedUa = '';

    auditor.auditBlocked = (ip, method, path, rawUa) => {
      blockedCalled = true;
      loggedIp = ip;
      loggedUa = rawUa ?? '';
    };

    const app = createTestApp(auditor, '192.168.1.50');

    // Spoofed friendly UA "Mozilla/5.0 (iPhone)" from external IP without token
    const res = await app.handle(
      new Request('http://localhost/api/characters', {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)'
        }
      })
    );

    // Must still be 401 Unauthorized — UA never grants bypass
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('auth_required');

    // Blocked audit fired post-verdict (Nit 2)
    expect(blockedCalled).toBe(true);
    expect(loggedIp).toBe('192.168.1.50');
    expect(loggedUa).toContain('iPhone');
  });

  it('Nit 1: Resolves N5 effective IP behind Vite dev proxy for auditor attribution', async () => {
    const auditor = new InboundAuditor();
    let auditedIp = '';
    let auditedUa = '';

    auditor.audit = (ip, method, path, rawUa) => {
      auditedIp = ip;
      auditedUa = rawUa ?? '';
    };

    // Remote socket address is 127.0.0.1 (Vite proxy), but x-forwarded-for has phone IP
    const app = createTestApp(auditor, '127.0.0.1');

    const res = await app.handle(
      new Request('http://localhost/api/auth/status', {
        headers: {
          'x-forwarded-for': '192.168.1.88',
          'user-agent': 'Mozilla/5.0 (Android 14; Mobile)'
        }
      })
    );

    expect(res.status).toBe(200);
    // Debounce key uses N5 effective IP (192.168.1.88), not 127.0.0.1
    expect(auditedIp).toBe('192.168.1.88');
    expect(auditedUa).toBe('Mozilla/5.0 (Android 14; Mobile)');
  });

  it('Nit 2: Loopback requests to protected endpoints bypass auth and stay silent', async () => {
    const auditor = new InboundAuditor();
    let blockedFired = false;
    let allowedFired = false;

    auditor.auditBlocked = () => {
      blockedFired = true;
    };
    auditor.audit = () => {
      allowedFired = true;
    };

    // Desktop loopback connection
    const app = createTestApp(auditor, '127.0.0.1');

    const res = await app.handle(new Request('http://localhost/api/characters'));
    expect(res.status).toBe(200);

    // Loopback never reaches 401, stays completely silent
    expect(blockedFired).toBe(false);
    // InboundAuditor.audit ignores loopback
    expect(allowedFired).toBe(false);
  });
});

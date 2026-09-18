import { Elysia } from 'elysia';
import { timingSafeEqual, createHash, createHmac, randomBytes } from 'node:crypto';
import {
  AuthVerifyRequestSchema,
  AuthStatusResponseSchema,
  AuthVerifyResponseSchema,
  type AuthStatusResponse,
  type AuthVerifyResponse
} from '@formatavern/shared';
import { effectiveClientIp, isLoopbackIp } from './ip';

export interface AuthDeps {
  enabled: boolean;
  pin?: string;
  verifyPin?: (candidate: string) => boolean;
  signToken?: () => string;
  verifyToken?: (token: string) => boolean;
  resolveIp?: (req: Request) => string | null;
  trustedProxies?: string[];
  rateLimitWindowMs?: number;
  rateLimitMaxFails?: number;
}

/**
 * Normalizes URL path and determines if it is exempt from the authentication gate (Invariant N6).
 */
export function isPublicAuthPath(pathname: string): boolean {
  const clean = pathname.split('?')[0].replace(/\/+$/, '');
  const norm = clean.startsWith('/api') ? clean.slice(4) : clean;
  return norm === '/health' || norm === '/auth/status' || norm === '/auth/verify';
}

/**
 * Constant-time comparison between candidate PIN and actual PIN using SHA-256 digests.
 * Prevents timing attacks without throwing length errors.
 */
export function verifyPinTimingSafe(candidate: string, actualPin: string): boolean {
  if (!candidate || !actualPin) return false;
  const hashA = createHash('sha256').update(candidate).digest();
  const hashB = createHash('sha256').update(actualPin).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * Creates a stateless signed HMAC token with a 30-day expiration (Invariant N7).
 */
export function createHmacToken(secret: Uint8Array, expMs: number = 30 * 24 * 60 * 60 * 1000): string {
  const nonce = randomBytes(16).toString('base64url');
  const exp = Date.now() + expMs;
  const payloadJson = JSON.stringify({ nonce, exp });
  const payloadB64 = Buffer.from(payloadJson, 'utf-8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

/**
 * Validates a stateless HMAC token in constant time and checks expiration (Invariant N7).
 */
export function verifyHmacToken(secret: Uint8Array, token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;

  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest();
  const actualSig = Buffer.from(sigB64, 'base64url');

  if (expectedSig.length !== actualSig.length) return false;
  if (!timingSafeEqual(expectedSig, actualSig)) return false;

  try {
    const payloadStr = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadStr);
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Sliding window rate limiter for failed PIN verification attempts.
 */
export class RateLimiter {
  private fails = new Map<string, number[]>();
  private windowMs: number;
  private maxFails: number;
  private lastSweep = Date.now();

  constructor(windowMs = 60_000, maxFails = 5) {
    this.windowMs = windowMs;
    this.maxFails = maxFails;
  }

  isRateLimited(ip: string): boolean {
    this.sweep();
    const now = Date.now();
    const timestamps = this.fails.get(ip);
    if (!timestamps) return false;
    const recent = timestamps.filter((t) => now - t < this.windowMs);
    this.fails.set(ip, recent);
    return recent.length >= this.maxFails;
  }

  recordFailure(ip: string): void {
    const now = Date.now();
    const timestamps = this.fails.get(ip) ?? [];
    const recent = timestamps.filter((t) => now - t < this.windowMs);
    recent.push(now);
    this.fails.set(ip, recent);
  }

  reset(ip: string): void {
    this.fails.delete(ip);
  }

  private sweep(): void {
    const now = Date.now();
    if (now - this.lastSweep < 30_000) return;
    this.lastSweep = now;
    for (const [ip, timestamps] of this.fails.entries()) {
      const recent = timestamps.filter((t) => now - t < this.windowMs);
      if (recent.length === 0) {
        this.fails.delete(ip);
      } else {
        this.fails.set(ip, recent);
      }
    }
  }
}

const ANSI_REGEX = /\x1b(?:\][^\x07\x1b]*(?:\x07|\x1b\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g;
const CONTROL_REGEX = /[\x00-\x1F\x7F]/g;
const WHITESPACE_REGEX = /\s+/g;

/**
 * Sanitize client User-Agent string:
 * - Strip ANSI escape sequences to prevent terminal escape injection.
 * - Collapse whitespace, carriage returns, and newlines into single spaces.
 * - Strip non-printable ASCII control characters.
 * - Truncate to 100 characters max, appending '…' if truncated.
 * - Fall back to 'unknown-device' if missing or blank.
 *
 * Security Invariant (R2): User-Agent is strictly a cosmetic diagnostic hint
 * and must NEVER influence authentication, bypass, or rate-limiting decisions.
 */
export function sanitizeUserAgent(raw?: string | null): string {
  if (!raw) return 'unknown-device';
  const stripped = raw
    .replace(ANSI_REGEX, '')
    .replace(WHITESPACE_REGEX, ' ')
    .replace(CONTROL_REGEX, '')
    .trim();
  if (!stripped) return 'unknown-device';
  if (stripped.length > 100) {
    return stripped.slice(0, 100) + '…';
  }
  return stripped;
}

/**
 * Sampled inbound audit logging.
 *
 * Features:
 * - Sampled per (effective IP + sanitized User-Agent) with a quiet window (default 10m).
 * - Debounce map is strictly bounded to maxEntries (default 200) with FIFO/oldest eviction (R1).
 * - Client IP passed here is the N5 effective IP (post-trustedProxies resolution),
 *   ensuring distinct clients proxied via Vite dev server are tracked independently.
 * - Separate tracking for inbound connection vs blocked unauthenticated request.
 * - Loopback addresses ('127.0.0.1', '::1') and 'unknown' are completely silent.
 */
export class InboundAuditor {
  private lastLogged = new Map<string, number>();
  private intervalMs: number;
  private maxEntries: number;

  constructor(intervalMs = 10 * 60 * 1000, maxEntries = 200) {
    this.intervalMs = intervalMs;
    this.maxEntries = maxEntries;
  }

  /** Current number of tracked debounce entries (for testing). */
  get entryCount(): number {
    return this.lastLogged.size;
  }

  private shouldLog(prefix: string, ip: string, rawUa?: string | null): { should: boolean; ua: string } {
    if (isLoopbackIp(ip) || ip === 'unknown') {
      return { should: false, ua: '' };
    }
    const ua = sanitizeUserAgent(rawUa);
    const key = `${prefix}:${ip}::${ua}`;
    const now = Date.now();
    const last = this.lastLogged.get(key);

    if (last && now - last <= this.intervalMs) {
      return { should: false, ua };
    }

    if (this.lastLogged.has(key)) {
      this.lastLogged.delete(key);
    } else if (this.lastLogged.size >= this.maxEntries) {
      const oldestKey = this.lastLogged.keys().next().value;
      if (oldestKey !== undefined) {
        this.lastLogged.delete(oldestKey);
      }
    }

    this.lastLogged.set(key, now);
    return { should: true, ua };
  }

  /**
   * Log an allowed inbound connection from an external client (sampled).
   */
  audit(ip: string, method: string, path: string, rawUa?: string | null): void {
    const { should, ua } = this.shouldLog('inbound', ip, rawUa);
    if (!should) return;
    console.log(`  \x1b[36m[network]\x1b[0m Inbound connection from ${ip} (${ua}) → ${method} ${path}`);
  }

  /**
   * Log a blocked unauthenticated request from an external client (sampled).
   * Fires from the onRequest gate after reaching the 401 verdict.
   */
  auditBlocked(ip: string, method: string, path: string, rawUa?: string | null): void {
    const { should, ua } = this.shouldLog('blocked', ip, rawUa);
    if (!should) return;
    console.log(
      `  \x1b[33m[security]\x1b[0m Blocked unauthenticated request from ${ip} (${ua}) → ${method} ${path}\n` +
      `             → Enter PIN on device to unlock, or set security.authMode: none in config.yaml`
    );
  }
}

export function createAuthRouter(deps: AuthDeps) {
  const rateLimiter = new RateLimiter(deps.rateLimitWindowMs ?? 60_000, deps.rateLimitMaxFails ?? 5);

  return new Elysia({ prefix: '/auth' })
    .get(
      '/status',
      ({ request }): AuthStatusResponse => {
        if (!deps.enabled) {
          return { authRequired: 'none' };
        }

        const remote = deps.resolveIp ? deps.resolveIp(request) : null;
        const xff = request.headers.get('x-forwarded-for');
        const clientIp = effectiveClientIp(remote, xff, deps.trustedProxies ?? ['127.0.0.1', '::1']);

        // Desktop loopback bypass
        if (isLoopbackIp(clientIp)) {
          return { authRequired: 'none' };
        }

        // Check if existing token in Authorization header is valid
        const authHeader = request.headers.get('authorization');
        if (authHeader?.startsWith('Bearer ') && deps.verifyToken) {
          const token = authHeader.slice(7).trim();
          if (deps.verifyToken(token)) {
            return { authRequired: 'none' };
          }
        }

        return { authRequired: 'pin' };
      },
      {
        response: AuthStatusResponseSchema
      }
    )
    .post(
      '/verify',
      ({ body, request, set }): AuthVerifyResponse | { error: { code: string; message: string } } => {
        const remote = deps.resolveIp ? deps.resolveIp(request) : null;
        const xff = request.headers.get('x-forwarded-for');
        const clientIp = effectiveClientIp(remote, xff, deps.trustedProxies ?? ['127.0.0.1', '::1']);

        if (rateLimiter.isRateLimited(clientIp)) {
          set.status = 429;
          set.headers['Retry-After'] = '60';
          return {
            error: {
              code: 'too_many_requests',
              message: 'Too many failed PIN attempts. Please wait 60 seconds before trying again.'
            }
          };
        }

        const candidatePin = body.pin;
        let valid = false;
        if (deps.verifyPin) {
          valid = deps.verifyPin(candidatePin);
        } else if (deps.pin) {
          valid = verifyPinTimingSafe(candidatePin, deps.pin);
        }

        if (!valid) {
          rateLimiter.recordFailure(clientIp);
          set.status = 401;
          return {
            error: {
              code: 'invalid_pin',
              message: 'Invalid PIN'
            }
          };
        }

        rateLimiter.reset(clientIp);

        const token = deps.signToken ? deps.signToken() : '';
        return { token };
      },
      {
        body: AuthVerifyRequestSchema
      }
    );
}

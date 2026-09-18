import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { AuthStore } from '../src/lib/auth/store.svelte';

describe('AuthStore (Invariants N6, N7, S8)', () => {
  let store: AuthStore;
  let mockLocalStorage: Record<string, string> = {};
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    mockLocalStorage = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => mockLocalStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockLocalStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockLocalStorage[k];
        },
        clear: () => {
          mockLocalStorage = {};
        }
      },
      configurable: true,
      writable: true
    });
    store = new AuthStore();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('provides empty auth headers when no token is present', () => {
    expect(store.authHeaders()).toEqual({});
  });

  it('injects Bearer token header when token is stored', () => {
    mockLocalStorage['formatavern_auth_token'] = 'test-token-123';
    const authedStore = new AuthStore();
    expect(authedStore.authHeaders()).toEqual({
      Authorization: 'Bearer test-token-123'
    });
  });

  it('sets status to none when server reports authRequired none on loopback/open mode', async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes('/api/auth/status')) {
        return new Response(JSON.stringify({ authRequired: 'none' }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }) as any;

    const status = await store.checkStatus();
    expect(status).toBe('none');
    expect(store.status).toBe('none');
  });

  it('sets status to pin-locked when server reports authRequired pin', async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes('/api/auth/status')) {
        return new Response(JSON.stringify({ authRequired: 'pin' }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }) as any;

    const status = await store.checkStatus();
    expect(status).toBe('pin-locked');
    expect(store.status).toBe('pin-locked');
  });

  it('verifies PIN, persists token, and transitions to authed state on success', async () => {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes('/api/auth/verify') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        if (body.pin === 'correct-pin') {
          return new Response(JSON.stringify({ token: 'signed-hmac-token-xyz' }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { code: 'invalid_pin' } }), { status: 401 });
      }
      return new Response('Not Found', { status: 404 });
    }) as any;

    // Fail attempt
    const failResult = await store.verifyPin('wrong-pin');
    expect(failResult.success).toBe(false);
    expect(failResult.error).toBe('Invalid PIN');
    expect(store.status).not.toBe('authed');

    // Success attempt
    const successResult = await store.verifyPin('correct-pin');
    expect(successResult.success).toBe(true);
    expect(store.status).toBe('authed');
    expect(store.token).toBe('signed-hmac-token-xyz');
    expect(mockLocalStorage['formatavern_auth_token']).toBe('signed-hmac-token-xyz');
  });

  it('clears token and locks state upon handleUnauthorized and forgetDevice', () => {
    mockLocalStorage['formatavern_auth_token'] = 'active-token';
    const activeStore = new AuthStore();
    activeStore.status = 'authed';

    activeStore.handleUnauthorized();
    expect(activeStore.status).toBe('pin-locked');
    expect(activeStore.token).toBeNull();
    expect(mockLocalStorage['formatavern_auth_token']).toBeUndefined();

    // Re-set and test forgetDevice
    mockLocalStorage['formatavern_auth_token'] = 'active-token-2';
    const store2 = new AuthStore();
    store2.status = 'authed';

    store2.forgetDevice();
    expect(store2.status).toBe('pin-locked');
    expect(store2.token).toBeNull();
    expect(mockLocalStorage['formatavern_auth_token']).toBeUndefined();
  });
});

export type AuthStatus = 'unknown' | 'none' | 'pin-locked' | 'authed';

const TOKEN_KEY = 'formatavern_auth_token';

/**
 * Reactive Svelte 5 store managing mobile PIN authentication, token lifecycle,
 * and Eden/SSE auth header injection (Invariants N6, N7).
 */
export class AuthStore {
  status = $state<AuthStatus>('unknown');
  token = $state<string | null>(null);

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem(TOKEN_KEY);
    }
  }

  /**
   * Returns authorization headers for Eden Treaty and readSse.
   */
  authHeaders(): Record<string, string> {
    if (this.token && this.token.length > 0) {
      return { Authorization: `Bearer ${this.token}` };
    }
    return {};
  }

  /**
   * Checks server authentication status on app boot.
   */
  async checkStatus(): Promise<AuthStatus> {
    try {
      const res = await fetch('/api/auth/status', {
        headers: this.authHeaders()
      });

      if (!res.ok) {
        this.status = 'pin-locked';
        return this.status;
      }

      const data = await res.json();
      if (data.authRequired === 'none') {
        this.status = this.token ? 'authed' : 'none';
      } else {
        this.status = 'pin-locked';
        this.clearToken();
      }
      return this.status;
    } catch {
      return this.status;
    }
  }

  /**
   * Submits a candidate PIN to /api/auth/verify.
   */
  async verifyPin(pin: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });

      if (res.status === 429) {
        return { success: false, error: 'Too many attempts. Please wait 60 seconds.' };
      }

      if (res.status === 401) {
        return { success: false, error: 'Invalid PIN' };
      }

      if (!res.ok) {
        return { success: false, error: 'Authentication failed' };
      }

      const data = await res.json();
      if (data.token) {
        this.setToken(data.token);
        this.status = 'authed';
        return { success: true };
      }

      return { success: false, error: 'No token received' };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Network error' };
    }
  }

  /**
   * Invoked when any API request receives 401 auth_required.
   */
  handleUnauthorized(): void {
    this.clearToken();
    this.status = 'pin-locked';
  }

  /**
   * Forgets the stored PIN auth token and transitions to locked state.
   */
  forgetDevice(): void {
    this.clearToken();
    this.status = 'pin-locked';
  }

  private setToken(t: string): void {
    this.token = t;
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOKEN_KEY, t);
    }
  }

  private clearToken(): void {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOKEN_KEY);
    }
  }
}

export const authStore = new AuthStore();

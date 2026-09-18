import { describe, it, expect } from 'bun:test';
import { resolveBackendBind, type LanCandidate } from '../../src/config/network';
import { formatBanner } from '../../src/config/banner';
import { DEFAULT_SERVER_CONFIG, type ServerConfig } from '../../src/config/schema';

describe('resolveBackendBind (Invariant N4)', () => {
  it('binds loopback in localhost mode regardless of dev/prod', () => {
    expect(resolveBackendBind('localhost', undefined, true)).toBe('127.0.0.1');
    expect(resolveBackendBind('localhost', undefined, false)).toBe('127.0.0.1');
  });

  it('binds loopback in dev mode even when mode is lan (Invariant N4)', () => {
    // In dev mode, only Vite binds 0.0.0.0:5173; backend stays on 127.0.0.1:3000
    expect(resolveBackendBind('lan', undefined, true)).toBe('127.0.0.1');
  });

  it('binds 0.0.0.0 in production when mode is lan', () => {
    expect(resolveBackendBind('lan', undefined, false)).toBe('0.0.0.0');
  });

  it('binds explicit host in custom mode', () => {
    expect(resolveBackendBind('custom', '192.168.1.100', true)).toBe('192.168.1.100');
    expect(resolveBackendBind('custom', '10.0.0.5', false)).toBe('10.0.0.5');
    expect(resolveBackendBind('custom', '', false)).toBe('127.0.0.1');
  });
});

describe('formatBanner', () => {
  const mockPrimary: LanCandidate = {
    address: '192.168.1.50',
    iface: 'Wi-Fi',
    kind: 'wifi',
    url: (p) => `http://192.168.1.50:${p}/`
  };

  const mockTailscale: LanCandidate = {
    address: '100.80.90.100',
    iface: 'tailscale0',
    kind: 'tailscale',
    url: (p) => `http://100.80.90.100:${p}/`
  };

  it('renders concise output for localhost mode without QR code', () => {
    const banner = formatBanner({
      config: DEFAULT_SERVER_CONFIG,
      candidates: [],
      primaryCandidate: null,
      tailscaleCandidate: null,
      isDev: true
    });

    expect(banner).toContain('http://127.0.0.1:5173/');
    expect(banner).toContain('http://127.0.0.1:3000/');
    expect(banner).not.toContain('█');
    expect(banner).not.toContain('Network:');
  });

  it('renders network URL and QR code targeting port 5173 in dev LAN mode (Invariant N8)', () => {
    const config: ServerConfig = {
      ...DEFAULT_SERVER_CONFIG,
      network: { ...DEFAULT_SERVER_CONFIG.network, mode: 'lan' },
      security: { ...DEFAULT_SERVER_CONFIG.security, authMode: 'pin', pin: '9876' }
    };

    const banner = formatBanner({
      config,
      candidates: [mockPrimary],
      primaryCandidate: mockPrimary,
      tailscaleCandidate: null,
      isDev: true,
      isTty: true,
      columns: 80
    });

    expect(banner).toContain('http://192.168.1.50:5173/');
    expect(banner).toContain('PIN Protected [••••]');
    // Never leak actual PIN in banner output
    expect(banner).not.toContain('9876');
    // QR code block characters present
    expect(banner).toContain('█');
  });

  it('renders network URL and QR code targeting port 3000 in prod LAN mode', () => {
    const config: ServerConfig = {
      ...DEFAULT_SERVER_CONFIG,
      network: { ...DEFAULT_SERVER_CONFIG.network, mode: 'lan', port: 3000 },
      security: { ...DEFAULT_SERVER_CONFIG.security, authMode: 'none' }
    };

    const banner = formatBanner({
      config,
      candidates: [mockPrimary, mockTailscale],
      primaryCandidate: mockPrimary,
      tailscaleCandidate: mockTailscale,
      isDev: false,
      isTty: true,
      columns: 80
    });

    expect(banner).toContain('http://192.168.1.50:3000/');
    expect(banner).toContain('http://100.80.90.100:3000/');
    expect(banner).toContain('OPEN — anyone on Wi-Fi can access chats');
  });

  it('suppresses QR matrix when terminal width is < 40 or qrCode is false', () => {
    const config: ServerConfig = {
      ...DEFAULT_SERVER_CONFIG,
      network: { ...DEFAULT_SERVER_CONFIG.network, mode: 'lan', qrCode: false }
    };

    const bannerNoQr = formatBanner({
      config,
      candidates: [mockPrimary],
      primaryCandidate: mockPrimary,
      tailscaleCandidate: null,
      isDev: true,
      columns: 80
    });
    expect(bannerNoQr).not.toContain('█');

    const bannerNarrow = formatBanner({
      config: { ...config, network: { ...config.network, qrCode: true } },
      candidates: [mockPrimary],
      primaryCandidate: mockPrimary,
      tailscaleCandidate: null,
      isDev: true,
      columns: 35
    });
    expect(bannerNarrow).not.toContain('█');
  });
});

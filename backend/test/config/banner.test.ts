import { describe, it, expect } from 'bun:test';
import { formatBanner } from '../../src/config/banner';
import { DEFAULT_SERVER_CONFIG, type ServerConfig } from '../../src/config/schema';
import type { LanCandidate } from '../../src/config/network';

function candidate(address: string, kind: LanCandidate['kind'] = 'other'): LanCandidate {
  return { address, iface: 'Wi-Fi', kind, url: (p: number) => `http://${address}:${p}/` };
}

function lanConfig(overrides: Partial<ServerConfig['network']> = {}, authMode: 'none' | 'pin' = 'none'): ServerConfig {
  return {
    ...DEFAULT_SERVER_CONFIG,
    network: { ...DEFAULT_SERVER_CONFIG.network, mode: 'lan', ...overrides },
    security: { ...DEFAULT_SERVER_CONFIG.security, authMode, ...(authMode === 'pin' ? { pin: '1337' } : {}) }
  };
}

const wifi = candidate('192.168.1.15', 'wifi');

describe('formatBanner (Invariants N8, N9)', () => {
  it('localhost mode prints loopback only, no QR/secret surface', () => {
    const banner = formatBanner({
      config: DEFAULT_SERVER_CONFIG,
      candidates: [],
      primaryCandidate: null,
      tailscaleCandidate: null,
      isDev: false
    });
    expect(banner).toContain('http://127.0.0.1:3000/');
    expect(banner).not.toContain('192.168');
    expect(banner).not.toContain('Scan with your phone');
  });

  it('lan + open auth carries a loud OPEN marker, never a PIN claim', () => {
    const banner = formatBanner({
      config: lanConfig(),
      candidates: [wifi],
      primaryCandidate: wifi,
      tailscaleCandidate: null,
      isDev: false
    });
    expect(banner).toContain('192.168.1.15:3000');
    expect(banner).toContain('OPEN');
    expect(banner).not.toContain('PIN Protected');
  });

  it('lan + pin auth claims protection without leaking the value', () => {
    const banner = formatBanner({
      config: lanConfig({}, 'pin'),
      candidates: [wifi],
      primaryCandidate: wifi,
      tailscaleCandidate: null,
      isDev: false
    });
    expect(banner).toContain('PIN Protected');
    expect(banner).not.toContain('1337');
  });

  it('names the PIN source so env-over-file surprises are self-diagnosing', () => {
    const fromEnv = formatBanner({
      config: lanConfig({}, 'pin'),
      candidates: [wifi],
      primaryCandidate: wifi,
      tailscaleCandidate: null,
      isDev: false,
      pinSource: 'env'
    });
    expect(fromEnv).toContain('(pin from environment)');

    const fromFile = formatBanner({
      config: lanConfig({}, 'pin'),
      candidates: [wifi],
      primaryCandidate: wifi,
      tailscaleCandidate: null,
      isDev: false,
      pinSource: 'file'
    });
    expect(fromFile).toContain('(pin from config.yaml)');

    const unknown = formatBanner({
      config: lanConfig({}, 'pin'),
      candidates: [wifi],
      primaryCandidate: wifi,
      tailscaleCandidate: null,
      isDev: false
    });
    expect(unknown).not.toContain('pin from');
  });

  it('dev QR targets Vite :5173, prod QR targets the backend port', () => {
    const dev = formatBanner({
      config: lanConfig(),
      candidates: [wifi],
      primaryCandidate: wifi,
      tailscaleCandidate: null,
      isDev: true
    });
    expect(dev).toContain('192.168.1.15:5173');

    const prod = formatBanner({
      config: lanConfig({ port: 4005 }),
      candidates: [candidate('192.168.1.15', 'wifi')],
      primaryCandidate: candidate('192.168.1.15', 'wifi'),
      tailscaleCandidate: null,
      isDev: false
    });
    expect(prod).toContain('192.168.1.15:4005');
  });

  it('announceLan:false suppresses every routable LAN detail including QR', () => {
    const banner = formatBanner({
      config: lanConfig({ announceLan: false }),
      candidates: [wifi],
      primaryCandidate: wifi,
      tailscaleCandidate: candidate('100.85.12.34', 'tailscale'),
      isDev: false
    });
    expect(banner).toContain('127.0.0.1');
    expect(banner).not.toContain('192.168.1.15');
    expect(banner).not.toContain('100.85.12.34');
    expect(banner).not.toContain('Scan with your phone');
  });

  it('custom mode announces the explicit host', () => {
    const banner = formatBanner({
      config: {
        ...DEFAULT_SERVER_CONFIG,
        network: { ...DEFAULT_SERVER_CONFIG.network, mode: 'custom', host: '10.8.0.6' }
      },
      candidates: [],
      primaryCandidate: null,
      tailscaleCandidate: null,
      isDev: false
    });
    expect(banner).toContain('10.8.0.6:3000');
  });
});

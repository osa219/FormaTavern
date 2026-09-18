import { describe, it, expect } from 'bun:test';
import type { NetworkInterfaceInfo } from 'node:os';
import { listLanCandidates, pickPrimary, detectTailscale } from '../../src/config/network';

describe('network interface discovery (Invariant N8, RFC1918)', () => {
  it('drops virtual adapters by name but preserves RFC1918 172.16/12 on physical interfaces', () => {
    const mockInterfaces: Record<string, NetworkInterfaceInfo[]> = {
      'vEthernet (WSL)': [
        { address: '172.28.16.1', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: '' }
      ],
      'docker0': [
        { address: '172.17.0.1', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: '' }
      ],
      'wsl-bridge': [
        { address: '192.168.100.1', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: '' }
      ],
      'br-58c0': [
        { address: '172.18.0.1', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: '' }
      ],
      'eth0': [
        // Genuine corporate/home LAN in 172.16.0.0/12 range
        { address: '172.20.5.4', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: '' }
      ],
      'Wi-Fi': [
        { address: '192.168.1.15', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: '' }
      ],
      'lo': [
        { address: '127.0.0.1', family: 'IPv4', internal: true, mac: '', netmask: '', cidr: '' }
      ]
    };

    const candidates = listLanCandidates(3000, mockInterfaces);

    // Virtual adapters must be filtered out
    expect(candidates.some((c) => c.iface.includes('vEthernet'))).toBe(false);
    expect(candidates.some((c) => c.iface.includes('docker'))).toBe(false);
    expect(candidates.some((c) => c.iface.includes('wsl'))).toBe(false);
    expect(candidates.some((c) => c.iface.includes('br-'))).toBe(false);

    // Genuine physical interfaces must survive
    expect(candidates.some((c) => c.address === '172.20.5.4' && c.iface === 'eth0')).toBe(true);
    expect(candidates.some((c) => c.address === '192.168.1.15' && c.iface === 'Wi-Fi')).toBe(true);
  });

  it('ranks Wi-Fi first, then Ethernet, then other', () => {
    const mockInterfaces: Record<string, NetworkInterfaceInfo[]> = {
      'Ethernet 2': [
        { address: '10.0.0.50', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: '' }
      ],
      'Wi-Fi': [
        { address: '192.168.1.15', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: '' }
      ]
    };

    const candidates = listLanCandidates(3000, mockInterfaces);
    expect(candidates.length).toBe(2);
    expect(candidates[0].iface).toBe('Wi-Fi');
    expect(candidates[0].kind).toBe('wifi');
    expect(candidates[1].iface).toBe('Ethernet 2');
    expect(candidates[1].kind).toBe('ethernet');

    const primary = pickPrimary(candidates);
    expect(primary).not.toBeNull();
    expect(primary?.address).toBe('192.168.1.15');
  });

  it('identifies Tailscale interfaces and separates them from primary candidates', () => {
    const mockInterfaces: Record<string, NetworkInterfaceInfo[]> = {
      'tailscale0': [
        { address: '100.85.12.34', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: '' }
      ],
      'Wi-Fi': [
        { address: '192.168.1.15', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: '' }
      ]
    };

    const candidates = listLanCandidates(3000, mockInterfaces);
    const ts = detectTailscale(candidates);
    expect(ts).not.toBeNull();
    expect(ts?.address).toBe('100.85.12.34');
    expect(ts?.kind).toBe('tailscale');

    const primary = pickPrimary(candidates);
    // Primary must be Wi-Fi, NOT Tailscale
    expect(primary?.kind).toBe('wifi');
    expect(primary?.address).toBe('192.168.1.15');
  });

  it('does not mistake CGNAT-range addresses for Tailscale (name-only detection)', () => {
    const mockInterfaces: Record<string, NetworkInterfaceInfo[]> = {
      'Ethernet': [
        // 100.64.0.0/10 is shared with carrier-grade NAT: a genuine LAN candidate
        { address: '100.90.1.7', family: 'IPv4', internal: false, mac: '', netmask: '', cidr: '' }
      ]
    };

    const candidates = listLanCandidates(3000, mockInterfaces);
    expect(candidates.length).toBe(1);
    expect(candidates[0].kind).toBe('ethernet');
    expect(detectTailscale(candidates)).toBeNull();

    // Still eligible as the primary LAN candidate
    const primary = pickPrimary(candidates);
    expect(primary?.address).toBe('100.90.1.7');
  });
});

import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

export interface LanCandidate {
  address: string;
  iface: string;
  kind: 'wifi' | 'ethernet' | 'other' | 'tailscale';
  url(port: number): string;
}

const VIRTUAL_IFACE_PATTERN = /^(vEthernet|docker|wsl|br-|vbox|vmware|hyper-v)/i;
const TAILSCALE_IFACE_PATTERN = /^tailscale/i;
const WIFI_IFACE_PATTERN = /(wi-?fi|wlan|wireless)/i;
const ETHERNET_IFACE_PATTERN = /(ethernet|eth|en)/i;

/**
 * Lists active IPv4 LAN candidates across network interfaces.
 * Filters out loopbacks, link-local, and virtual adapters (WSL, Docker, Hyper-V).
 * Tailscale is detected by interface NAME only: the 100.64.0.0/10 range is shared
 * with carrier-grade NAT, so a prefix match must never classify an address on its
 * own (a corporate CGNAT address is a genuine LAN candidate, not a tunnel).
 */
export function listLanCandidates(
  port: number,
  injectedInterfaces?: Record<string, NetworkInterfaceInfo[] | undefined>
): LanCandidate[] {
  const ifaces = injectedInterfaces ?? networkInterfaces();
  const candidates: LanCandidate[] = [];

  for (const [ifaceName, infos] of Object.entries(ifaces)) {
    if (!infos || VIRTUAL_IFACE_PATTERN.test(ifaceName)) {
      continue;
    }

    for (const info of infos) {
      if (info.internal) continue;
      // Accept IPv4 only
      if (info.family !== 'IPv4' && (info.family as any) !== 4) continue;

      const addr = info.address;
      // Filter loopback and link-local
      if (addr.startsWith('127.') || addr === '::1' || addr.startsWith('169.254.')) {
        continue;
      }

      let kind: LanCandidate['kind'] = 'other';
      if (TAILSCALE_IFACE_PATTERN.test(ifaceName)) {
        kind = 'tailscale';
      } else if (WIFI_IFACE_PATTERN.test(ifaceName)) {
        kind = 'wifi';
      } else if (ETHERNET_IFACE_PATTERN.test(ifaceName)) {
        kind = 'ethernet';
      }

      candidates.push({
        address: addr,
        iface: ifaceName,
        kind,
        url: (p: number) => `http://${addr}:${p}/`
      });
    }
  }

  // Stable sort: Wi-Fi > Ethernet > other > Tailscale
  const rank = { wifi: 1, ethernet: 2, other: 3, tailscale: 4 };
  return candidates.sort((a, b) => rank[a.kind] - rank[b.kind] || a.iface.localeCompare(b.iface));
}

/**
 * Picks the primary non-Tailscale candidate for default LAN connection.
 */
export function pickPrimary(candidates: LanCandidate[]): LanCandidate | null {
  const nonTailscale = candidates.filter((c) => c.kind !== 'tailscale');
  return nonTailscale[0] ?? null;
}

/**
 * Detects whether an active Tailscale interface candidate exists.
 */
export function detectTailscale(candidates: LanCandidate[]): LanCandidate | null {
  return candidates.find((c) => c.kind === 'tailscale') ?? null;
}

/**
 * Resolves the IP/hostname to which the backend Elysia server should bind.
 * Enforces Invariant N4: in dev mode, LAN exposure happens exclusively via Vite (0.0.0.0:5173)
 * while the backend remains safely bound to loopback (127.0.0.1).
 */
export function resolveBackendBind(
  mode: 'localhost' | 'lan' | 'custom',
  customHost: string | undefined,
  isDev: boolean
): string {
  if (mode === 'localhost') {
    return '127.0.0.1';
  }
  if (mode === 'lan') {
    return isDev ? '127.0.0.1' : '0.0.0.0';
  }
  if (mode === 'custom') {
    return customHost && customHost.trim().length > 0 ? customHost.trim() : '127.0.0.1';
  }
  return '127.0.0.1';
}

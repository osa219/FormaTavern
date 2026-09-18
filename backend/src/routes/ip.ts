/**
 * Normalizes IPv6-mapped IPv4 addresses (e.g., ::ffff:127.0.0.1 -> 127.0.0.1).
 */
export function normalizeIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7);
  }
  return trimmed;
}

/**
 * Resolves the effective client IP address (Invariant N5).
 * The X-Forwarded-For header is ONLY trusted if the direct remote address is in trustedProxies
 * (typically loopback / reverse proxies such as Vite or local Nginx).
 * If the remote address is not trusted, spoofed XFF headers are strictly ignored.
 */
export function effectiveClientIp(
  remoteAddr: string | null | undefined,
  xff: string | null | undefined,
  trustedProxies: string[]
): string {
  const normRemote = normalizeIp(remoteAddr);
  if (!normRemote) {
    return 'unknown';
  }

  const isTrusted = trustedProxies.some((proxy) => {
    const normProxy = normalizeIp(proxy);
    return normProxy === normRemote;
  });

  if (isTrusted && xff && xff.trim().length > 0) {
    // Leftmost entry in XFF is the original client
    const leftmost = xff.split(',')[0].trim();
    const normLeft = normalizeIp(leftmost);
    if (normLeft && normLeft.length > 0) {
      return normLeft;
    }
  }

  return normRemote;
}

/**
 * Checks if an IP represents local loopback.
 */
export function isLoopbackIp(ip: string | null | undefined): boolean {
  const norm = normalizeIp(ip);
  if (!norm) return false;
  return norm === '127.0.0.1' || norm === '::1' || norm.startsWith('127.') || norm === 'localhost';
}

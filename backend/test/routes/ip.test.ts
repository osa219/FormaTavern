import { describe, it, expect } from 'bun:test';
import { effectiveClientIp, isLoopbackIp, normalizeIp } from '../../src/routes/ip';

describe('effectiveClientIp (Invariant N5)', () => {
  const trustedProxies = ['127.0.0.1', '::1'];

  it('uses direct remoteAddr when not a trusted proxy, ignoring spoofed XFF', () => {
    const remote = '192.168.1.45';
    const spoofedXff = '127.0.0.1'; // Attacker claims to be loopback
    const effective = effectiveClientIp(remote, spoofedXff, trustedProxies);
    expect(effective).toBe('192.168.1.45');
  });

  it('honors leftmost XFF entry when remoteAddr IS in trustedProxies', () => {
    const remote = '127.0.0.1'; // Vite dev server proxying request
    const xff = '192.168.1.45, 10.0.0.1';
    const effective = effectiveClientIp(remote, xff, trustedProxies);
    expect(effective).toBe('192.168.1.45');
  });

  it('normalizes IPv6-mapped IPv4 remote and proxy addresses', () => {
    const remote = '::ffff:127.0.0.1';
    const xff = '::ffff:192.168.1.80';
    const effective = effectiveClientIp(remote, xff, trustedProxies);
    expect(effective).toBe('192.168.1.80');
  });

  it('falls back to remote address if XFF is empty or whitespace when proxy is trusted', () => {
    expect(effectiveClientIp('127.0.0.1', '', trustedProxies)).toBe('127.0.0.1');
    expect(effectiveClientIp('127.0.0.1', '   ', trustedProxies)).toBe('127.0.0.1');
  });

  it('returns unknown when remoteAddr is null or empty', () => {
    expect(effectiveClientIp(null, '192.168.1.1', trustedProxies)).toBe('unknown');
    expect(effectiveClientIp(undefined, null, trustedProxies)).toBe('unknown');
  });

  it('identifies loopback IPs accurately', () => {
    expect(isLoopbackIp('127.0.0.1')).toBe(true);
    expect(isLoopbackIp('::1')).toBe(true);
    expect(isLoopbackIp('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackIp('127.0.0.50')).toBe(true);
    expect(isLoopbackIp('localhost')).toBe(true);
    expect(isLoopbackIp('192.168.1.50')).toBe(false);
    expect(isLoopbackIp('10.0.0.1')).toBe(false);
    expect(isLoopbackIp('unknown')).toBe(false);
  });
});

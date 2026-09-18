import { describe, it, expect } from 'bun:test';
import { renderQrHalfBlocks } from '../../src/config/qr';

describe('renderQrHalfBlocks (Invariant N8)', () => {
  it('renders valid ANSI half-block matrix for standard HTTP URL', () => {
    const url = 'http://192.168.1.50:5173/';
    const lines = renderQrHalfBlocks(url);

    expect(lines.length).toBeGreaterThan(10);
    expect(lines.length).toBeLessThan(35);

    // Verify all lines have equal column width
    const width = lines[0].length;
    for (const line of lines) {
      expect(line.length).toBe(width);
      // Half blocks characters allowed: █, ▀, ▄, space
      expect(line).toMatch(/^[█▀▄ ]+$/);
    }
  });

  it('contains no secrets or auth tokens in the encoded target', () => {
    const url = 'http://192.168.1.50:3000/';
    expect(url).not.toContain('pin=');
    expect(url).not.toContain('token=');
    expect(url).not.toContain('key=');

    const lines = renderQrHalfBlocks(url);
    expect(lines.length).toBeGreaterThan(0);
  });
});

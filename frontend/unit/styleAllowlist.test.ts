import { describe, it, expect } from 'bun:test';
import { rebuildStyle } from '../src/lib/render/styleAllowlist';

describe('styleAllowlist (rebuildStyle)', () => {
  it('allows safe layout, typography, colors, and borders', () => {
    const raw = 'color: #f00; font-size: 1.25rem; margin: 10px; border-radius: 8px; display: flex;';
    const result = rebuildStyle(raw);
    expect(result).toBe('color: #f00; font-size: 1.25rem; margin: 10px; border-radius: 8px; display: flex');
  });

  it('allows safe /assets/ and data:image/ in url()', () => {
    const assetUrl = 'background-image: url("/assets/eldrin/bg.png");';
    expect(rebuildStyle(assetUrl)).toBe('background-image: url("/assets/eldrin/bg.png")');

    const dataUrl = 'background-image: url("data:image/png;base64,AAAA");';
    expect(rebuildStyle(dataUrl)).toBe('background-image: url("data:image/png;base64,AAAA")');
  });

  it('rejects remote URLs in background-image (P3 Invariant)', () => {
    const httpUrl = 'background-image: url("http://evil.com/leak.png");';
    expect(rebuildStyle(httpUrl)).toBe('');

    const httpsUrl = 'background-image: url("https://tracker.com/t.png");';
    expect(rebuildStyle(httpsUrl)).toBe('');

    const schemelessUrl = 'background-image: url("//evil.com/t.png");';
    expect(rebuildStyle(schemelessUrl)).toBe('');
  });

  it('rejects CSS expressions, javascript:, and escapes', () => {
    expect(rebuildStyle('width: expression(alert(1));')).toBe('');
    expect(rebuildStyle('background: url("javascript:alert(1)");')).toBe('');
    expect(rebuildStyle('color: \\6a\\61\\76\\61;')).toBe('');
    expect(rebuildStyle('behavior: url(x.htc);')).toBe('');
    expect(rebuildStyle('-moz-binding: url(x.xml#test);')).toBe('');
  });

  it('rejects forbidden properties outside allowlist', () => {
    const raw = 'position: fixed; top: 0; left: 0; z-index: 9999; color: red;';
    const result = rebuildStyle(raw);
    expect(result).toBe('color: red');
  });

  it('rejects unbalanced parentheses or quotes', () => {
    expect(rebuildStyle('width: calc(100px - 20px; color: red;')).toBe('color: red');
    expect(rebuildStyle('font-family: "Arial, sans-serif; color: red;')).toBe('color: red');
  });
});

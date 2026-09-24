import { describe, it, expect } from 'bun:test';
import { extractMediaHashes, rewriteMediaUrls, MEDIA_URL_RE } from '../src/mediaUrls';

describe('mediaUrls (Invariant X4 & URI Protocol)', () => {
  const validHash1 = '44326304f3cbe987ced888a14600cf06442eaca8935899e8e5a9ec2a8a48fe8a';
  const validHash2 = 'fda8fc052bd7b64e33c71e46f3892ab3ac6f1824482a4f97ce1e838b6a1e81d8';

  it('matches valid 64-character lowercase hex hashes', () => {
    const text = `Look at this photo: media://${validHash1} and also ![caption](media://${validHash2})`;
    const hashes = extractMediaHashes(text);
    expect(hashes).toEqual([validHash1, validHash2]);
  });

  it('rejects uppercase hex hashes', () => {
    const upperHash = validHash1.toUpperCase();
    const text = `Photo: media://${upperHash}`;
    expect(extractMediaHashes(text)).toEqual([]);
  });

  it('rejects short hex hashes (< 64 chars)', () => {
    const shortHash = validHash1.slice(0, 63);
    const text = `Photo: media://${shortHash}`;
    expect(extractMediaHashes(text)).toEqual([]);
  });

  it('rejects long hex hashes (> 64 chars)', () => {
    const longHash = validHash1 + 'a';
    const text = `Photo: media://${longHash}`;
    expect(extractMediaHashes(text)).toEqual([]);
  });

  it('rejects non-hex characters in hash', () => {
    const invalidHash = 'g' + validHash1.slice(1);
    const text = `Photo: media://${invalidHash}`;
    expect(extractMediaHashes(text)).toEqual([]);
  });

  it('deduplicates multiple references to the same hash in order of appearance', () => {
    const text = `1: media://${validHash1}, 2: media://${validHash2}, 3: media://${validHash1}`;
    expect(extractMediaHashes(text)).toEqual([validHash1, validHash2]);
  });

  it('returns empty array on empty, non-string, or text without media://', () => {
    expect(extractMediaHashes('')).toEqual([]);
    expect(extractMediaHashes(null as any)).toEqual([]);
    expect(extractMediaHashes('Just a normal message without images.')).toEqual([]);
  });

  it('rewrites media:// URLs using resolver function', () => {
    const text = `Scene: ![Alt](media://${validHash1}) and avatar: <img src="media://${validHash2}">`;
    const rewritten = rewriteMediaUrls(text, (h) => `/assets/pool/${h}.png`);
    expect(rewritten).toBe(`Scene: ![Alt](/assets/pool/${validHash1}.png) and avatar: <img src="/assets/pool/${validHash2}.png">`);
  });

  it('is idempotent: rewrite(rewrite(x)) === rewrite(x)', () => {
    const text = `Scene: ![Alt](media://${validHash1}) and text media://${validHash2}`;
    const rewriteOnce = rewriteMediaUrls(text, (h) => `/assets/pool/${h}.webp`);
    const rewriteTwice = rewriteMediaUrls(rewriteOnce, (h) => `/assets/pool/${h}.webp`);
    expect(rewriteTwice).toBe(rewriteOnce);
  });
});

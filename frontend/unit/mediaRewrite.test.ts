import { describe, it, expect, beforeEach } from 'bun:test';
import {
  rewriteHtmlMediaUrls,
  resolveMediaUrl,
  probeMediaExtension,
  renderMissingAssetSlate,
  extractPersonaSnapshotName,
  clearMediaCache,
  PROBE_EXTENSIONS
} from '../src/lib/render/mediaRewrite';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const HASH_MISSING = 'f'.repeat(64);

describe('Media Rewrite & Fallback Engine (Invariant X4, P3)', () => {
  beforeEach(() => {
    clearMediaCache();
  });

  describe('1. Hash -> URL with extMap', () => {
    it('rewrites <img src="media://{hash}"> to /assets/pool/{hash}.<ext> using extMap object', () => {
      const input = `<img src="media://${HASH_A}" alt="Hero" />`;
      const output = rewriteHtmlMediaUrls(input, { extMap: { [HASH_A]: 'png' } });
      expect(output).toContain(`/assets/pool/${HASH_A}.png`);
      expect(output).toContain('alt="Hero"');
    });

    it('rewrites <img src="media://{hash}"> using Map instance', () => {
      const extMap = new Map([[HASH_B, 'jpg']]);
      const input = `<img src="media://${HASH_B}" />`;
      const output = rewriteHtmlMediaUrls(input, { extMap });
      expect(output).toContain(`/assets/pool/${HASH_B}.jpg`);
    });

    it('defaults to .webp when ext is not in map or cache', () => {
      const input = `<img src="media://${HASH_C}" />`;
      const output = rewriteHtmlMediaUrls(input);
      expect(output).toContain(`/assets/pool/${HASH_C}.webp`);
    });

    it('rewrites <a> href="media://{hash}" to pool asset path', () => {
      const input = `<a href="media://${HASH_A}">Download</a>`;
      const output = rewriteHtmlMediaUrls(input, { extMap: { [HASH_A]: 'png' } });
      expect(output).toBe(`<a href="/assets/pool/${HASH_A}.png">Download</a>`);
    });

    it('rewrites standalone media://{hash} to an inline image by default', () => {
      const input = `<p>Check this out: media://${HASH_A}</p>`;
      const output = rewriteHtmlMediaUrls(input, { extMap: { [HASH_A]: 'webp' } });
      expect(output).toContain(`<img src="/assets/pool/${HASH_A}.webp" alt="media"`);
    });

    it('rewrites standalone media://{hash} to plain URL when standaloneAsImage is false', () => {
      const input = `<p>Asset at: media://${HASH_A}</p>`;
      const output = rewriteHtmlMediaUrls(input, {
        extMap: { [HASH_A]: 'webp' },
        standaloneAsImage: false
      });
      expect(output).toBe(`<p>Asset at: /assets/pool/${HASH_A}.webp</p>`);
    });
  });

  describe('2. Fallback probe order (.webp -> .png -> .jpg -> .gif)', () => {
    it('probes candidate extensions strictly in order via HEAD and stops on first 200', async () => {
      const calls: string[] = [];
      const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        calls.push(url);
        // Fail webp, succeed on png
        if (url.endsWith('.png')) {
          return new Response(null, { status: 200 });
        }
        return new Response(null, { status: 404 });
      };

      const resolved = await probeMediaExtension(HASH_A, { fetchFn: mockFetch as any });
      expect(resolved).toBe('png');
      expect(calls).toEqual([
        `/assets/pool/${HASH_A}.webp`,
        `/assets/pool/${HASH_A}.png`
      ]);
    });

    it('caches successful probe so subsequent lookups require zero network calls', async () => {
      let callCount = 0;
      const mockFetch = async (_url: any) => {
        callCount++;
        return new Response(null, { status: 200 });
      };

      const first = await probeMediaExtension(HASH_B, { fetchFn: mockFetch as any });
      expect(first).toBe('webp');
      expect(callCount).toBe(1);

      // Second call must hit memory cache
      const second = await probeMediaExtension(HASH_B, { fetchFn: mockFetch as any });
      expect(second).toBe('webp');
      expect(callCount).toBe(1);
    });

    it('probes through all 4 candidates and records missing when all return 404', async () => {
      const probedExts: string[] = [];
      const mockFetch = async (input: any) => {
        const url = String(input);
        for (const ext of PROBE_EXTENSIONS) {
          if (url.endsWith(`.${ext}`)) probedExts.push(ext);
        }
        return new Response(null, { status: 404 });
      };

      const result = await probeMediaExtension(HASH_MISSING, { fetchFn: mockFetch as any });
      expect(result).toBeNull();
      expect(probedExts).toEqual(['webp', 'png', 'jpg', 'gif']);

      // Subsequent lookup immediately returns null via missing cache
      let secondCalls = 0;
      const secondResult = await probeMediaExtension(HASH_MISSING, {
        fetchFn: (async () => { secondCalls++; return new Response(null); }) as any
      });
      expect(secondResult).toBeNull();
      expect(secondCalls).toBe(0);
    });

    it('resolveMediaUrl resolves full path with probe fallback', async () => {
      const mockFetch = async (input: any) => {
        if (String(input).endsWith('.gif')) {
          return new Response(null, { status: 200 });
        }
        return new Response(null, { status: 404 });
      };

      const url = await resolveMediaUrl(HASH_C, { fetchFn: mockFetch as any });
      expect(url).toBe(`/assets/pool/${HASH_C}.gif`);
    });
  });

  describe('3. Missing asset slate render (data-missing-asset)', () => {
    it('renders missing asset slate in place of <img> when hash is in missingHashes', () => {
      const input = `<img src="media://${HASH_MISSING}" alt="Vanished" />`;
      const output = rewriteHtmlMediaUrls(input, { missingHashes: [HASH_MISSING] });
      expect(output).toContain('class="missing-asset-slate');
      expect(output).toContain(`data-missing-asset="${HASH_MISSING}"`);
      expect(output).toContain('Missing media');
      expect(output).not.toContain('<img');
    });

    it('renders missing asset slate in place of standalone media://', () => {
      const input = `<p>Unavailable: media://${HASH_MISSING}</p>`;
      const output = rewriteHtmlMediaUrls(input, { missingHashes: new Set([HASH_MISSING]) });
      expect(output).toContain(`data-missing-asset="${HASH_MISSING}"`);
      expect(output).not.toContain(`media://${HASH_MISSING}`);
    });

    it('renders missing anchor slate for href links', () => {
      const input = `<a href="media://${HASH_MISSING}">Missing File</a>`;
      const output = rewriteHtmlMediaUrls(input, { missingHashes: [HASH_MISSING] });
      expect(output).toContain('href="#missing-asset"');
      expect(output).toContain(`data-missing-asset="${HASH_MISSING}"`);
    });

    it('renderMissingAssetSlate produces deterministic markup with data attribute', () => {
      const markup = renderMissingAssetSlate(HASH_A);
      expect(markup).toContain(`data-missing-asset="${HASH_A}"`);
      expect(markup).toContain('missing-asset-slate');
      expect(markup).toContain('Missing media');
    });
  });

  describe('4. Zero remote fetch enforcement (Invariant P3, X4)', () => {
    it('never probes or fetches from external http(s) hosts', async () => {
      const fetchedHosts: string[] = [];
      const mockFetch = async (input: any) => {
        const url = String(input);
        if (/^https?:\/\//i.test(url)) {
          fetchedHosts.push(new URL(url).host);
        }
        return new Response(null, { status: 200 });
      };

      await probeMediaExtension(HASH_A, { fetchFn: mockFetch as any });
      expect(fetchedHosts).toHaveLength(0);
    });

    it('only ever generates internal /assets/pool/ paths', () => {
      const input = `<img src="media://${HASH_A}" /> <p>media://${HASH_B}</p>`;
      const output = rewriteHtmlMediaUrls(input, { extMap: { [HASH_A]: 'png', [HASH_B]: 'webp' } });
      expect(output).not.toMatch(/https?:\/\//i);
      expect(output).toContain(`/assets/pool/${HASH_A}.png`);
      expect(output).toContain(`/assets/pool/${HASH_B}.webp`);
    });

    it('leaves invalid or non-64-hex media references untouched', () => {
      const input = '<p>media://short media://UPPERCASE64' + 'F'.repeat(48) + '</p>';
      const output = rewriteHtmlMediaUrls(input);
      expect(output).toBe(input);
    });

    it('is idempotent under repeated rewrites', () => {
      const input = `<p>Photo: <img src="media://${HASH_A}" /></p>`;
      const once = rewriteHtmlMediaUrls(input, { extMap: { [HASH_A]: 'png' } });
      const twice = rewriteHtmlMediaUrls(once, { extMap: { [HASH_A]: 'png' } });
      expect(once).toBe(twice);
    });
  });

  describe('5. Persona snapshot name extractor (LoreDrawer "You" tab)', () => {
    it('extracts name from valid JSON persona snapshot object', () => {
      const snapshot = JSON.stringify({ name: 'Adventurer', description: 'Brave wanderer' });
      expect(extractPersonaSnapshotName(snapshot)).toBe('Adventurer');
    });

    it('extracts name from raw string snapshot fallback', () => {
      expect(extractPersonaSnapshotName('Traveler')).toBe('Traveler');
      expect(extractPersonaSnapshotName('  Nomad  ')).toBe('Nomad');
    });

    it('returns null for null, undefined, or empty snapshot', () => {
      expect(extractPersonaSnapshotName(null)).toBeNull();
      expect(extractPersonaSnapshotName(undefined)).toBeNull();
      expect(extractPersonaSnapshotName('')).toBeNull();
      expect(extractPersonaSnapshotName('   ')).toBeNull();
    });

    it('returns null for JSON object without valid name property', () => {
      expect(extractPersonaSnapshotName(JSON.stringify({ description: 'No name' }))).toBeNull();
      expect(extractPersonaSnapshotName(JSON.stringify({ name: '' }))).toBeNull();
    });
  });
});

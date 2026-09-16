import { describe, it, expect } from 'bun:test';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function walkDir(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, fileList);
    } else if (/\.(svelte|ts|js|css)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const SRC_DIR = resolve(import.meta.dir, '../src');

describe('Architecture & Boundary Police (Invariant U2, U3, U6)', () => {
  const allSourceFiles = walkDir(SRC_DIR);

  it('prohibits document.createElement("style") and insertRule across all frontend src (Invariant U2, Amendment A-U2b)', () => {
    for (const file of allSourceFiles) {
      const normalizedPath = file.replace(/\\/g, '/');
      const isApprovedStyleOutlet = normalizedPath.endsWith('/lib/components/custom/CustomStyleOutlet.svelte');
      const content = readFileSync(file, 'utf-8');
      if (!isApprovedStyleOutlet) {
        expect(content).not.toContain("createElement('style')");
        expect(content).not.toContain('createElement("style")');
      }
      expect(content).not.toContain('insertRule(');
    }
  });

  it('ensures @formatavern/shared/customCss is NOT statically imported at runtime outside loader or tests (Invariant C13)', () => {
    for (const file of allSourceFiles) {
      const content = readFileSync(file, 'utf-8');
      // Prohibit value imports from @formatavern/shared/customCss
      const valueImportRegex = /import\s+(?!type\s+)(?:[\w*\s{},]+)\s+from\s+['"]@formatavern\/shared\/customCss(?:\/index)?['"]/;
      expect(valueImportRegex.test(content)).toBe(false);
    }
  });

  it('prohibits template-literal dynamic class generation (class=`...${ or class="...${)', () => {
    // Regex for dynamic class generation via template literal or interpolated string
    const dynamicClassRegex = /class=(?:\{`[^`]*\$\{|"[^"]*\$\{)/;
    for (const file of allSourceFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(dynamicClassRegex.test(content)).toBe(false);
    }
  });

  it('prohibits transition-all and transition: all across src (Invariant U6)', () => {
    for (const file of allSourceFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toContain('transition-all');
      expect(content).not.toContain('transition: all');
    }
  });

  it('ensures parseEnvelope is imported ONLY in stream.svelte.ts and greetingPreview.ts (Invariant U3, Amendment A-U3)', () => {
    for (const file of allSourceFiles) {
      const normalizedPath = file.replace(/\\/g, '/');
      if (normalizedPath.includes('/routes/dev/')) continue;
      const isApprovedParserModule =
        normalizedPath.endsWith('/lib/state/stream.svelte.ts') ||
        normalizedPath.endsWith('/lib/studio/greetingPreview.ts');
      const content = readFileSync(file, 'utf-8');
      if (content.includes('parseEnvelope')) {
        expect(isApprovedParserModule).toBe(true);
      }
    }
  });

  it('ensures {@html is used ONLY inside Markdown.svelte and ShowcaseBody.svelte (Sanitization Guard, Amendment A-U2)', () => {
    for (const file of allSourceFiles) {
      const normalizedPath = file.replace(/\\/g, '/');
      if (normalizedPath.includes('/routes/dev/')) continue;
      const isApprovedHtmlSink =
        normalizedPath.endsWith('/lib/components/ui/Markdown.svelte') ||
        normalizedPath.endsWith('/lib/components/showcase/ShowcaseBody.svelte');
      const content = readFileSync(file, 'utf-8');
      if (content.includes('{@html')) {
        expect(isApprovedHtmlSink).toBe(true);
      }
    }
  });

  it('ensures every Backdrop host establishes a stacking context (isolate) so the -z-10 backdrop paints above the root background', () => {
    for (const file of allSourceFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('<Backdrop')) {
        expect(content).toMatch(/\bisolate\b/);
      }
    }
  });

  it('keeps the chat message-log scroll chain intact: main must be flex-col so the log flex-1 root constrains and the inner log scrolls', () => {
    const viewport = readFileSync(join(SRC_DIR, 'lib/components/chat/ChatViewport.svelte'), 'utf-8');
    const mainMatch = viewport.match(/<main\b[^>]*>/);
    expect(mainMatch).not.toBeNull();
    const mainTag = mainMatch![0];
    expect(mainTag).toMatch(/\bflex\b/);
    expect(mainTag).toMatch(/\bflex-col\b/);
    expect(mainTag).toMatch(/\bmin-h-0\b/);
    expect(mainTag).toMatch(/\boverflow-hidden\b/);

    const log = readFileSync(join(SRC_DIR, 'lib/components/chat/MessageLog.svelte'), 'utf-8');
    expect(log).toContain('flex-1 min-h-0');
    expect(log).toMatch(/overflow-y-auto/);
  });

  it('prohibits role-branched justify-end in chat turn rendering components (Invariant L2)', () => {
    const turnFiles = [
      'SpeechBubble.svelte',
      'TurnRow.svelte',
      'MessageTurn.svelte',
      'NarratorBlock.svelte',
      'SegmentAvatar.svelte'
    ];
    for (const name of turnFiles) {
      const file = join(SRC_DIR, 'lib/components/chat', name);
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toContain('justify-end');
    }
  });

  it('ensures per-voice rows are the primitive in MessageTurn (Invariant L1)', () => {
    const turn = readFileSync(join(SRC_DIR, 'lib/components/chat/MessageTurn.svelte'), 'utf-8');
    expect(turn).toContain('<TurnRow');
  });
});

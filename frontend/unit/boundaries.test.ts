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

  it('prohibits document.createElement("style") and insertRule across all frontend src', () => {
    for (const file of allSourceFiles) {
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toContain("createElement('style')");
      expect(content).not.toContain('createElement("style")');
      expect(content).not.toContain('insertRule(');
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
});

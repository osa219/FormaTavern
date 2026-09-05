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

  it('ensures parseEnvelope is imported ONLY in stream.svelte.ts (Invariant U3)', () => {
    for (const file of allSourceFiles) {
      const normalizedPath = file.replace(/\\/g, '/');
      if (normalizedPath.includes('/routes/dev/')) continue;
      const isStreamController = normalizedPath.endsWith('/lib/state/stream.svelte.ts');
      const content = readFileSync(file, 'utf-8');
      if (content.includes('parseEnvelope')) {
        expect(isStreamController).toBe(true);
      }
    }
  });

  it('ensures {@html is used ONLY inside Markdown.svelte (Sanitization Guard)', () => {
    for (const file of allSourceFiles) {
      const normalizedPath = file.replace(/\\/g, '/');
      if (normalizedPath.includes('/routes/dev/')) continue;
      const isMarkdownComponent = normalizedPath.endsWith('/lib/components/ui/Markdown.svelte');
      const content = readFileSync(file, 'utf-8');
      if (content.includes('{@html')) {
        expect(isMarkdownComponent).toBe(true);
      }
    }
  });
});

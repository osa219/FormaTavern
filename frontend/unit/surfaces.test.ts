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
    } else if (/\.(svelte|ts)$/.test(file)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const ROUTES_DIR = resolve(import.meta.dir, '../src/routes');
const SRC_DIR = resolve(import.meta.dir, '../src');

function establishesSurface(filePath: string, depth = 0): boolean {
  if (depth > 3) return false;
  const content = readFileSync(filePath, 'utf-8');
  if (
    content.includes('<ShellSurface') ||
    content.includes('data-ft-surface="character"') ||
    content.includes('data-ft-surface="chat"')
  ) {
    return true;
  }
  // Check imported and rendered Svelte components
  const importMatches = [...content.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g)];
  for (const [, compName, relPath] of importMatches) {
    if (content.includes(`<${compName}`)) {
      const baseDir = resolve(filePath, '..');
      let targetPath = relPath.startsWith('.')
        ? resolve(baseDir, relPath)
        : resolve(SRC_DIR, relPath.replace(/^\$lib\//, 'lib/'));
      if (!targetPath.endsWith('.svelte')) {
        targetPath = `${targetPath}.svelte`;
      }
      try {
        if (statSync(targetPath).isFile()) {
          if (establishesSurface(targetPath, depth + 1)) return true;
        }
      } catch {}
    }
  }
  return false;
}

describe('Surface Completeness & Dialog Scoping (Invariant C14)', () => {
  const allRouteFiles = walkDir(ROUTES_DIR).filter((f) => f.endsWith('+page.svelte'));
  const allSvelteFiles = walkDir(SRC_DIR).filter((f) => f.endsWith('.svelte'));

  it('ensures every route establishes or delegates to an authorized surface root', () => {
    for (const file of allRouteFiles) {
      const normalizedPath = file.replace(/\\/g, '/');
      if (normalizedPath.includes('/routes/dev/')) continue;

      const hasAuthorizedSurface = establishesSurface(file);

      expect(
        hasAuthorizedSurface,
        `Route ${normalizedPath} must establish or delegate to an authorized surface root`
      ).toBe(true);
    }
  });

  it('ensures no dialogs or sheets are rendered outside ShellSurface boundaries', () => {
    for (const file of allSvelteFiles) {
      const content = readFileSync(file, 'utf-8');

      if (content.includes('</ShellSurface>')) {
        const afterShellClose = content.split('</ShellSurface>')[1] || '';

        expect(afterShellClose).not.toContain('<ConfirmDialog');
        expect(afterShellClose).not.toContain('<SettingsSheet');
        expect(afterShellClose).not.toContain('<dialog');
      }
    }
  });

  it('ensures buttons and interactive elements with bg-accent use text-accent-contrast', () => {
    for (const file of allSvelteFiles) {
      const content = readFileSync(file, 'utf-8');

      // Prohibit hardcoded dark text on bg-accent so dark accent themes remain readable
      expect(content).not.toMatch(/bg-accent[^'"`}]*text-neutral-950/);
      expect(content).not.toMatch(/text-neutral-950[^'"`}]*bg-accent/);
      expect(content).not.toMatch(/bg-accent[^'"`}]*text-black/);
      expect(content).not.toMatch(/text-black[^'"`}]*bg-accent/);
    }
  });
});

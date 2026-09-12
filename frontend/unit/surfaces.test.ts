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

  it('ensures status badges and success labels honor theme accent instead of hardcoded emerald', () => {
    const inspectedFiles = [
      'CustomCssPanel.svelte',
      'SettingsSheet.svelte',
      'LivePreview.svelte',
      'DirectorDrawer.svelte'
    ];
    for (const file of allSvelteFiles) {
      const match = inspectedFiles.some((name) => file.endsWith(name));
      if (!match) continue;
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/text-emerald-[3-6]00/);
      expect(content).not.toMatch(/bg-emerald-[3-6]00/);
    }
  });

  it('ensures shell discovery components and settings sheet use semantic chrome text tokens rather than hardcoded neutral-100', () => {
    const shellComponents = [
      'CompanionCard.svelte',
      'SearchBar.svelte',
      'TagFilter.svelte',
      'SortSelect.svelte',
      'SettingsSheet.svelte'
    ];
    for (const file of allSvelteFiles) {
      const match = shellComponents.some((name) => file.endsWith(name));
      if (!match) continue;
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toContain('text-neutral-100');
    }
  });

  it('ensures persona components and confirm dialog use semantic chrome tokens rather than hardcoded neutral-100 or neutral-900', () => {
    const harmonizedComponents = [
      'PersonaCard.svelte',
      'PersonaEditor.svelte',
      'ConfirmDialog.svelte',
      'BubblePreview.svelte'
    ];
    for (const file of allSvelteFiles) {
      const match = harmonizedComponents.some((name) => file.endsWith(name));
      if (!match) continue;
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toContain('text-neutral-100');
      expect(content).not.toContain('bg-neutral-900');
    }
  });

  it('ensures themable scrollbar custom properties and rules are configured in app.css', () => {
    const appCssPath = resolve(SRC_DIR, 'app.css');
    const css = readFileSync(appCssPath, 'utf-8');
    expect(css).toContain('--scrollbar-track');
    expect(css).toContain('--scrollbar-thumb');
    expect(css).toContain('--scrollbar-thumb-hover');
    expect(css).toContain('scrollbar-color:');
    expect(css).toContain('::-webkit-scrollbar');
  });

  it('ensures checkboxes use accent-accent rather than text-accent for theme coloring', () => {
    for (const file of allSvelteFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('type="checkbox"')) {
        expect(content).not.toMatch(/type="checkbox"[^>]*text-accent/);
        expect(content).not.toMatch(/text-accent[^>]*type="checkbox"/);
      }
    }
  });

  it('ensures studio editor components use semantic chrome tokens rather than hardcoded neutral-100 or neutral-900', () => {
    const studioComponents = [
      'StudioShell.svelte',
      'IdentityPanel.svelte',
      'VoicePanel.svelte',
      'ShowcaseEditor.svelte',
      'AestheticPanel.svelte',
      'StatePanel.svelte',
      'BindingsPanel.svelte',
      'GalleryManager.svelte'
    ];
    for (const file of allSvelteFiles) {
      const match = studioComponents.some((name) => file.endsWith(name));
      if (!match) continue;
      const content = readFileSync(file, 'utf-8');
      expect(content).not.toContain('text-neutral-100');
      expect(content).not.toContain('bg-neutral-900');
    }
  });
});

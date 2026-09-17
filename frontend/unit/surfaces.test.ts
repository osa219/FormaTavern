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
      'discovery/CharacterCard.svelte',
      'CompanionCard.svelte',
      'SearchBar.svelte',
      'TagFilter.svelte',
      'SortSelect.svelte',
      'SettingsSheet.svelte'
    ];
    for (const file of allSvelteFiles) {
      const normalized = file.replace(/\\/g, '/');
      const match = shellComponents.some((name) => normalized.endsWith(name));
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

  it('ensures data-ft-surface is only present on authorized surface roots and never on html or layout', () => {
    // 1. Verify app.html never sets data-ft-surface as a DOM attribute.
    // Frame-0 bootstrap references the shell surface via CSS selector text inside
    // <script>; strip scripts before asserting so the selector is allowed while
    // an actual attribute on html/body remains forbidden (A-SURF1).
    const appHtmlPath = resolve(SRC_DIR, 'app.html');
    const appHtmlContent = readFileSync(appHtmlPath, 'utf-8');
    const appHtmlNoScript = appHtmlContent.replace(/<script[\s\S]*?<\/script>/gi, '');
    expect(appHtmlNoScript).not.toContain('data-ft-surface');
    expect(appHtmlContent).not.toContain("setAttribute('data-ft-surface'");
    expect(appHtmlContent).not.toContain('setAttribute("data-ft-surface"');
    expect(appHtmlContent).not.toContain('documentElement.style');

    // 2. Verify +layout.svelte never sets data-ft-surface on html/document (uses data-ft-active-surface)
    const layoutPath = resolve(ROUTES_DIR, '+layout.svelte');
    const layoutContent = readFileSync(layoutPath, 'utf-8');
    expect(layoutContent).not.toContain("setAttribute('data-ft-surface'");
    expect(layoutContent).not.toContain('data-ft-surface=');
    expect(layoutContent).toContain("setAttribute('data-ft-active-surface'");

    // 3. Verify all occurrences of data-ft-surface in templates are only in authorized surface roots
    const allowedSurfaceFiles = [
      'ShellSurface.svelte',
      'ChatViewport.svelte',
      '+page.svelte',
      'LivePreview.svelte',
      'ShowcaseEditor.svelte'
    ];

    for (const file of allSvelteFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('data-ft-surface=')) {
        const isAuthorized = allowedSurfaceFiles.some((allowed) => file.endsWith(allowed));
        expect(
          isAuthorized,
          `Unauthorized data-ft-surface found in ${file.replace(/\\/g, '/')}`
        ).toBe(true);
      }
    }

    // 4. Verify LivePreview isolates its local chrome reset from studio shell
    const livePreviewPath = resolve(SRC_DIR, 'lib/components/studio/LivePreview.svelte');
    const previewContent = readFileSync(livePreviewPath, 'utf-8');
    expect(previewContent).toContain('--n-950: #313338;');
    expect(previewContent).toContain('--chrome-bg: color-mix(');
    expect(previewContent).toContain('color-scheme: dark;');
  });

  it('ensures themable range slider rules and pseudoelements are configured in app.css', () => {
    const appCssPath = resolve(SRC_DIR, 'app.css');
    const css = readFileSync(appCssPath, 'utf-8');
    expect(css).toContain('input[type="range"]');
    expect(css).toContain('::-webkit-slider-runnable-track');
    expect(css).toContain('::-webkit-slider-thumb');
    expect(css).toContain('::-moz-range-track');
    expect(css).toContain('::-moz-range-thumb');
    expect(css).toContain('var(--chrome-line)');
    expect(css).toContain('var(--theme-accent)');
  });
});

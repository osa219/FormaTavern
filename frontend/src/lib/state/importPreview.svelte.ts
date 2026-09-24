import type { ImportPreview } from '@formatavern/shared';

/**
 * Single-slot handoff for import previews. The Foyer import dialog parses a
 * file via POST /api/import/preview, stashes the result here, and navigates
 * to /character/new, which consumes it into a Studio draft. Nothing persists
 * until the user saves the draft — same guarantee as the CLI dry-run.
 */
class ImportPreviewStore {
  preview = $state<ImportPreview | null>(null);

  set(next: ImportPreview): void {
    this.preview = next;
  }

  consume(): ImportPreview | null {
    const current = this.preview;
    this.preview = null;
    return current;
  }

  clear(): void {
    this.preview = null;
  }
}

export const importPreviewStore = new ImportPreviewStore();

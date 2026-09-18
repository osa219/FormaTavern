import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { copyToClipboard } from '../src/lib/utils/clipboard';

describe('Clipboard Helper & Insecure Context Fallback (Invariant C14, Section 7.1)', () => {
  const origNavigator = globalThis.navigator;
  const origDocument = globalThis.document;

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: origNavigator,
      configurable: true,
      writable: true
    });
    Object.defineProperty(globalThis, 'document', {
      value: origDocument,
      configurable: true,
      writable: true
    });
  });

  it('uses modern navigator.clipboard.writeText in secure contexts', async () => {
    let copiedText = '';
    const mockClipboard = {
      writeText: async (text: string) => {
        copiedText = text;
      }
    };

    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: mockClipboard },
      configurable: true,
      writable: true
    });

    const success = await copyToClipboard('Hello Secure World');
    expect(success).toBe(true);
    expect(copiedText).toBe('Hello Secure World');
  });

  it('falls back to document.execCommand in insecure mobile contexts and cleans up textarea', async () => {
    let execCommandCalled = false;
    let appendedEl: any = null;
    let removedEl: any = null;

    // Simulate insecure context where navigator.clipboard is undefined
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true
    });

    const mockDocument = {
      createElement: (tag: string) => {
        const el: any = {
          tagName: tag.toUpperCase(),
          style: {},
          attributes: {},
          setAttribute: (k: string, v: string) => {
            el.attributes[k] = v;
          },
          focus: () => {},
          select: () => {},
          setSelectionRange: () => {},
          parentNode: null
        };
        return el;
      },
      body: {
        appendChild: (child: any) => {
          appendedEl = child;
          child.parentNode = mockDocument.body;
        },
        removeChild: (child: any) => {
          removedEl = child;
          child.parentNode = null;
        }
      },
      execCommand: (command: string) => {
        if (command === 'copy') {
          execCommandCalled = true;
          return true;
        }
        return false;
      }
    };

    Object.defineProperty(globalThis, 'document', {
      value: mockDocument,
      configurable: true,
      writable: true
    });

    const success = await copyToClipboard('Hello Insecure LAN');
    expect(success).toBe(true);
    expect(execCommandCalled).toBe(true);
    expect(appendedEl).not.toBeNull();
    expect(appendedEl.value).toBe('Hello Insecure LAN');
    expect(appendedEl.attributes['aria-hidden']).toBe('true');
    expect(appendedEl.attributes['readonly']).toBe('');
    expect(removedEl).toBe(appendedEl);
  });

  it('returns false and never throws when all copy mechanisms fail', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: async () => {
            throw new Error('Permission denied');
          }
        }
      },
      configurable: true,
      writable: true
    });

    Object.defineProperty(globalThis, 'document', {
      value: {
        createElement: () => {
          throw new Error('DOM failure');
        }
      },
      configurable: true,
      writable: true
    });

    const success = await copyToClipboard('Test text');
    expect(success).toBe(false);
  });

  it('enforces boundary rule: no direct navigator.clipboard.writeText calls outside clipboard.ts', () => {
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

    const srcDir = resolve(import.meta.dir, '../src');
    const allFiles = walkDir(srcDir);
    const violatingFiles: string[] = [];

    for (const file of allFiles) {
      if (file.endsWith('clipboard.ts')) continue;
      const content = readFileSync(file, 'utf-8');
      if (content.includes('navigator.clipboard.writeText')) {
        violatingFiles.push(file.replace(/\\/g, '/'));
      }
    }

    expect(
      violatingFiles,
      `Direct navigator.clipboard.writeText found outside clipboard.ts in: ${violatingFiles.join(', ')}`
    ).toEqual([]);
  });
});

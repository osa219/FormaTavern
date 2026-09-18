/**
 * Copies text to the system clipboard across secure and insecure mobile contexts.
 * In secure contexts (HTTPS or localhost), uses navigator.clipboard.writeText.
 * In insecure contexts (plain HTTP over local LAN on mobile devices),
 * gracefully falls back to document.execCommand('copy').
 *
 * Always returns a boolean promise (never throws).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // 1. Try modern asynchronous Clipboard API
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback
    }
  }

  // 2. Legacy fallback for insecure HTTP LAN contexts
  if (typeof document === 'undefined') {
    return false;
  }

  let ta: HTMLTextAreaElement | null = null;
  try {
    ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.tabIndex = -1;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '2em';
    ta.style.height = '2em';
    ta.style.padding = '0';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.boxShadow = 'none';
    ta.style.background = 'transparent';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';

    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const success = document.execCommand('copy');
    return success;
  } catch {
    return false;
  } finally {
    if (ta && ta.parentNode) {
      ta.parentNode.removeChild(ta);
    }
  }
}

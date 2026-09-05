/**
 * Derives a stable hue (0-359) for an NPC:
 * - Checks chat.metadata.npcs[name]?.accent if present (extracts hue if hsl or derives)
 * - Otherwise computes a deterministic string hash of the name
 */
export function npcHue(name: string, npcs?: Record<string, { accent?: string }>): number {
  if (!name) return 200;
  if (npcs && npcs[name]?.accent) {
    const accent = npcs[name].accent!;
    const hslMatch = accent.match(/hsl\(\s*(\d+(?:\.\d+)?)/i);
    if (hslMatch) {
      return Math.round(Number(hslMatch[1])) % 360;
    }
  }

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

import { Type } from '@sinclair/typebox';

/** Slugs ('eldrin-the-mage') and ULIDs both match. */
export const Id = Type.String({ pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$' });
export const UnixMs = Type.Integer({ minimum: 0 });

/**
 * A raw CSS value destined for an inline `style` attribute / custom property.
 * Forbids the characters that could break out of a declaration. This is the
 * import-safety guard promised by the Styling-as-Data philosophy.
 */
export const CssToken = Type.String({ pattern: '^[^;{}<>]*$', minLength: 1, maxLength: 256 });

/** Local asset only. No http(s):, data:, or traversal. */
export const AssetPath = Type.String({ pattern: '^/assets/[A-Za-z0-9_-]+(/[A-Za-z0-9._-]+)+$', maxLength: 512 });

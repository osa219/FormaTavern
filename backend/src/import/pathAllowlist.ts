import { resolve, normalize } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { ApiError } from '../engine/errors';

export const DEFAULT_KNOWN_IMPORT_ROOT = 'S:/WorkSpace/Projects Workspace/Python/JAI_Migration/exports/custom_engine';

export function getAllowedImportRoots(extraRoots: string[] = []): string[] {
  const rawRoots: string[] = [];
  const envDir = process.env.FORMATAVERN_IMPORT_DIR;
  if (envDir) {
    rawRoots.push(envDir);
  }
  rawRoots.push(DEFAULT_KNOWN_IMPORT_ROOT);
  for (const r of extraRoots) {
    rawRoots.push(r);
  }
  return rawRoots.map((r) => {
    const res = resolve(r);
    try {
      if (existsSync(res)) {
        return normalize(realpathSync(res)).toLowerCase();
      }
    } catch {}
    return normalize(res).toLowerCase();
  });
}

export function validateImportPath(candidatePath: string, allowedRoots?: string[]): string {
  if (!candidatePath || typeof candidatePath !== 'string') {
    throw new ApiError('validation_failed', 422, 'Target import path must be a non-empty string');
  }

  // Resolve absolute path and canonicalize if existing
  const resolved = resolve(candidatePath);
  let canonicalCandidate = resolved;
  if (existsSync(resolved)) {
    try {
      canonicalCandidate = realpathSync(resolved);
    } catch {}
  }
  const normalizedCandidate = normalize(canonicalCandidate).toLowerCase();

  const roots = getAllowedImportRoots(allowedRoots);
  const isAllowed = roots.some((root) => {
    // Exact match or sub-path
    return (
      normalizedCandidate === root ||
      normalizedCandidate.startsWith(root + '\\') ||
      normalizedCandidate.startsWith(root + '/')
    );
  });

  if (!isAllowed) {
    throw new ApiError('forbidden', 403, `Import path "${candidatePath}" is not within allowed directories`);
  }

  return canonicalCandidate;
}

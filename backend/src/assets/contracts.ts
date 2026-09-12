export type AssetScope = 'persona' | 'draft' | 'character' | 'fonts';

export interface AssetUploadOptions {
  file: Uint8Array;
  filename: string;
  scope: AssetScope;
  targetId?: string;
}

export interface AssetMeta {
  path: string;
  width: number;
  height: number;
  size: number;
  mime: string;
}

export interface AssetStore {
  save(opts: AssetUploadOptions): Promise<AssetMeta>;
  delete(assetPath: string): Promise<boolean>;
  promoteDraft(draftId: string, finalSlug: string): Promise<void>;
  deleteScope(scope: AssetScope, targetId: string): Promise<void>;
  cleanStaleDrafts(maxAgeMs: number): Promise<number>;
}

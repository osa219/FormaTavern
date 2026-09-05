import { ASSETS_DIR } from '../src/db/paths';
import { FsAssetStore } from '../src/assets/store';

const store = new FsAssetStore(ASSETS_DIR);
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

try {
  const count = await store.cleanStaleDrafts(ONE_DAY_MS);
  console.log(`[assets-gc] Cleaned ${count} stale draft directories older than 24h.`);
} catch (err: any) {
  console.error('[assets-gc] Error cleaning draft directories:', err.message);
  process.exit(1);
}

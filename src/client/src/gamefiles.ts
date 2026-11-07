import { loadAsync } from 'jszip';
import { get, set } from 'idb-keyval';
import { t } from './locale';
import { updateStatus } from './desktop';

const FILE_KEY = 'cs16-gamefiles-v1';

export async function getGameFiles() {
  let buffer: ArrayBuffer | undefined;
  try { buffer = await get<ArrayBuffer>(FILE_KEY); } catch { /* cache unavailable */ }
  if (buffer) {
    updateStatus(t('gamefileCache'));
    try { return await loadAsync(buffer); } catch { buffer = undefined; }
  }

  updateStatus(t('gamefileDownload'));
  const response = await fetch('/gamefiles.zip', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Game files HTTP ' + response.status);
  buffer = await response.arrayBuffer();
  // A failed IndexedDB quota write must not prevent play.
  try { await set(FILE_KEY, buffer); } catch { /* cache optional */ }
  return loadAsync(buffer);
}

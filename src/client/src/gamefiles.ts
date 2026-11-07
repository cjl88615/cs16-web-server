import JSZip from 'jszip';
import { get, set, del } from 'idb-keyval';
import { storageNotice, updateProgress, updateStatus } from './desktop';
import { zh } from './zh';
export { safeGamePath } from './paths';
const FILE_KEY = 'cs16-gamefiles-v2';
interface CachedFiles { version: string; buffer: ArrayBuffer }
export async function clearGameCache(): Promise<void> {
  await del(FILE_KEY);
  await del('gamefiles.zip');
}
async function validateZip(buffer: ArrayBuffer): Promise<JSZip> {
  const zip = await JSZip.loadAsync(buffer);
  if (!Object.keys(zip.files).some(name => name.startsWith('cstrike/'))) {
    throw new Error('游戏资源包缺少 cstrike 目录。');
  }
  return zip;
}
export async function getGameFiles(): Promise<JSZip> {
  const manifest = await fetch('/gamefiles.version.json', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!manifest.ok) throw new Error('资源清单不可用，请检查服务器构建。');
  const { sha256 } = await manifest.json() as { sha256: string };
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('资源版本信息无效。');
  try {
    const cached = await get<CachedFiles>(FILE_KEY);
    if (cached?.version === sha256 && cached.buffer instanceof ArrayBuffer) {
      updateStatus(zh.cached);
      try { return await validateZip(cached.buffer); }
      catch { await del(FILE_KEY); }
    }
  } catch { storageNotice(zh.cacheUnavailable); }
  updateStatus(zh.download);
  updateProgress(0, 0);
  const response = await fetch('/gamefiles.zip', { signal: AbortSignal.timeout(600000) });
  if (!response.ok) throw new Error(`${zh.download}: HTTP ${response.status}`);
  const size = Number(response.headers.get('content-length')) || 0;
  let buffer: ArrayBuffer;
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); loaded += value.length;
      updateProgress(loaded, size);
      updateStatus(`${zh.download}（${(loaded / 1048576).toFixed(1)} MB${size ? ` / ${(size / 1048576).toFixed(1)} MB` : ''}）`);
    }
    const bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    chunks.length = 0;
    buffer = bytes.buffer;
  } else { buffer = await response.arrayBuffer(); }
  const zip = await validateZip(buffer);
  try { await set(FILE_KEY, { version: sha256, buffer } satisfies CachedFiles); }
  catch { storageNotice(zh.cacheUnavailable); }
  return zip;
}

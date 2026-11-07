import { zh } from './zh';
import { cachePlayerName, normalizePlayerName, savedPlayerName } from './player';
import { removeDesktop, updateProgress, updateStatus } from './desktop';
import type { Xash3DWebRTC } from './webrtc';
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = zh[el.dataset.i18n as keyof typeof zh] || '';
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-label]')) el.setAttribute('aria-label', zh[el.dataset.i18nLabel as keyof typeof zh]);
document.title = zh.title;
const form = document.getElementById('join-form') as HTMLFormElement;
const playButton = document.getElementById('play-button') as HTMLButtonElement;
const cacheButton = document.getElementById('cache-button') as HTMLButtonElement;
const nameInput = document.getElementById('player-name-input') as HTMLInputElement;
const volumeInput = document.getElementById('volume-input') as HTMLInputElement;
const errorStatus = document.getElementById('error-status')!;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
let engine: Xash3DWebRTC | undefined;
let stage: 'idle' | 'loading' | 'ready' | 'playing' | 'error' = 'idle';
nameInput.value = savedPlayerName();
volumeInput.addEventListener('input', () => { document.getElementById('volume-value')!.textContent = `${volumeInput.value}%`; });
function fail(message: string) {
  stage = 'error'; engine?.disconnect();
  document.getElementById('desktop')!.hidden = false; canvas.hidden = true;
  document.getElementById('menu-toggle')!.hidden = true;
  const menu = document.getElementById('game-menu') as HTMLDialogElement;
  if (menu.open) menu.close();
  errorStatus.textContent = message; errorStatus.hidden = false;
  playButton.textContent = zh.retry; playButton.disabled = false; cacheButton.disabled = false;
  updateStatus(zh.failed);
}
async function prepare() {
  stage = 'loading'; playButton.disabled = true; cacheButton.disabled = true;
  errorStatus.hidden = true; playButton.textContent = zh.loading; updateStatus(zh.engine);
  const [{ createEngine }, { getGameFiles, safeGamePath }] = await Promise.all([import('./engine'), import('./gamefiles')]);
  canvas.hidden = false; // Measurable viewport, behind the opaque lobby.
  engine = createEngine();
  const [zip] = await Promise.all([getGameFiles(), engine.init()]);
  const files = Object.entries(zip.files).filter(([, file]) => !file.dir);
  // Limit decompression concurrency instead of unpacking every file at once.
  for (let offset = 0; offset < files.length; offset += 4) {
    await Promise.all(files.slice(offset, offset + 4).map(async ([filename, file]) => {
      const unsafeName = (file as typeof file & { unsafeOriginalName?: string }).unsafeOriginalName;
      if (!safeGamePath(filename) || (unsafeName && !safeGamePath(unsafeName))) return;
      const path = `/rodir/${filename}`;
      engine!.em.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
      engine!.em.FS.writeFile(path, await file.async('uint8array'));
    }));
    const loaded = Math.min(files.length, offset + 4);
    updateStatus(`${zh.unpack}（${loaded}/${files.length}）`); updateProgress(loaded, files.length);
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  engine.em.FS.chdir('/rodir'); updateStatus(zh.network); await engine.connect();
  stage = 'ready'; updateProgress(1, 1); updateStatus(zh.ready);
  playButton.textContent = zh.enter; playButton.disabled = false; playButton.focus();
}
function start() {
  const name = normalizePlayerName(nameInput.value);
  if (!name || !engine) { nameInput.focus(); return; }
  nameInput.value = name; cachePlayerName(name); removeDesktop(); stage = 'playing';
  engine.main(); engine.Cmd_ExecuteString('_vgui_menus 0');
  if (!window.matchMedia('(hover: hover)').matches) engine.Cmd_ExecuteString('touch_enable 1');
  engine.Cmd_ExecuteString(`name "${name}"`);
  const volume = Math.max(0, Math.min(1, Number(volumeInput.value) / 100 || 0));
  engine.Cmd_ExecuteString(`volume ${volume.toFixed(2)}`);
  engine.Cmd_ExecuteString('connect 127.0.0.1:8080'); // Virtual endpoint, NOT the VM address.
  canvas.focus();
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (stage === 'error') { location.reload(); return; }
  const name = normalizePlayerName(nameInput.value);
  if (!name) { errorStatus.textContent = zh.invalidName; errorStatus.hidden = false; nameInput.focus(); return; }
  nameInput.value = name;
  if (!('WebAssembly' in window) || !('RTCPeerConnection' in window)) { fail(zh.unsupported); return; }
  try { if (stage === 'idle') await prepare(); else if (stage === 'ready') start(); }
  catch (error) { console.error(error); fail(error instanceof Error ? error.message : zh.failed); }
});
cacheButton.addEventListener('click', async () => {
  cacheButton.disabled = true;
  try { const { clearGameCache } = await import('./gamefiles'); await clearGameCache(); updateStatus(zh.cacheCleared); }
  catch { updateStatus(zh.cacheUnavailable); }
  finally { cacheButton.disabled = false; }
});
window.addEventListener('cs16-disconnected', () => { if (stage === 'playing' || stage === 'ready') fail(zh.disconnected); });
window.addEventListener('beforeunload', event => { if (stage === 'playing') { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => engine?.disconnect());
const menu = document.getElementById('game-menu') as HTMLDialogElement;
const toggle = document.getElementById('menu-toggle')!;
function openMenu() { if (stage === 'playing') { document.exitPointerLock?.(); menu.showModal(); } }
function closeMenu() { menu.close(); canvas.focus(); try { const request = canvas.requestPointerLock(); request?.catch(() => {}); } catch { /* Canvas remains clickable. */ } }
toggle.addEventListener('click', openMenu);
document.getElementById('menu-close')!.addEventListener('click', closeMenu);
menu.addEventListener('cancel', event => { event.preventDefault(); closeMenu(); });
window.addEventListener('keydown', event => {
  if (event.code === 'F2' && stage === 'playing' && !event.repeat) {
    event.preventDefault(); event.stopImmediatePropagation(); if (menu.open) closeMenu(); else openMenu();
  }
}, true);
const commands: Record<string, string[]> = {
  ct: ['jointeam 2', 'joinclass 5'], t: ['jointeam 1', 'joinclass 5'], auto: ['jointeam 5', 'joinclass 5'],
  ak47: ['ak47'], m4a1: ['m4a1'], awp: ['awp'], deagle: ['deagle'], armor: ['vesthelm'], ammo: ['primammo'], defuse: ['defuser'], grenade: ['hegren'], flash: ['flash'],
};
menu.querySelectorAll<HTMLButtonElement>('[data-game]').forEach(button => button.addEventListener('click', () => {
  if (stage !== 'playing' || !engine) return;
  for (const command of commands[button.dataset.game!] || []) engine.Cmd_ExecuteString(command);
  document.getElementById('command-status')!.textContent = zh.sent;
}));
document.getElementById('fullscreen-button')!.addEventListener('click', async () => { try { await document.documentElement.requestFullscreen(); } catch { /* Optional. */ } });
async function loadServerInfo() {
  try {
    const response = await fetch('/api/server-info', { signal: AbortSignal.timeout(7000), cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const info = await response.json();
    const status = document.getElementById('server-status')!; status.textContent = zh.online; status.className = 'online';
    document.getElementById('server-map')!.textContent = String(info.map || zh.unknown);
    document.getElementById('bot-quota')!.textContent = `${Number(info.botQuota) || 0} ${zh.people}`;
    const levels = ['新手', '休闲', '普通', '困难', '大师'];
    document.getElementById('bot-difficulty')!.textContent = levels[Number(info.botDifficulty)] || zh.unknown;
    document.getElementById('max-players')!.textContent = `${Number(info.maxPlayers) || 0} ${zh.people}`;
  } catch { document.getElementById('server-status')!.textContent = zh.offline; }
}
void loadServerInfo();

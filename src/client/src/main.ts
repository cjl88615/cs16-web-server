import { createEngine } from './engine';
import { getGameFiles } from './gamefiles';
import { removeDesktop, updateProgress, updateStatus } from './desktop';
import { cachePlayerName, getPlayerName } from './player';
import { initLocale, t, type MessageKey } from './locale';
import type { Xash3DWebRTC } from './webrtc';

const playButton = document.getElementById('play-button') as HTMLButtonElement;
let currentStatus: MessageKey = 'initializing';
let progressText = '';

function report(key: MessageKey, detail = ''): void {
  currentStatus = key;
  progressText = detail;
  updateStatus(t(key) + detail);
}

initLocale(() => report(currentStatus, progressText));

async function initApp(): Promise<void> {
  try {
    report('initializing');
    const engine = createEngine();
    await initEngine(engine);
    playButton.addEventListener('click', (event) => {
      event.preventDefault();
      start(engine);
    }, { once: true });
    playButton.disabled = false;
    report('ready');
  } catch (error) {
    console.error('Failed to initialize CS 1.6:', error);
    report('loadError');
  }
}

async function initEngine(engine: Xash3DWebRTC): Promise<void> {
  const [archive] = await Promise.all([getGameFiles(), engine.init()]);
  const entries = Object.entries(archive.files).filter(([, file]) => !file.dir);
  let next = 0;
  let loaded = 0;
  const count = entries.length;
  updateProgress(0, count);
  const worker = async (): Promise<void> => {
    while (next < entries.length) {
      const [filename, file] = entries[next++];
      if (!file) continue;
      const path = '/rodir/' + filename;
      engine.em.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')));
      engine.em.FS.writeFile(path, await file.async('uint8array'));
      loaded += 1;
      if (loaded % 20 === 0 || loaded === count) {
        updateProgress(loaded, count);
        report('unpacking', ' (' + loaded + '/' + count + ')');
      }
    }
  };
  // Bounded workers avoid the original Promise.all(files) memory spike.
  await Promise.all(Array.from({ length: 4 }, () => worker()));
  engine.em.FS.chdir('/rodir');
  updateProgress(1, 1);
}

function start(engine: Xash3DWebRTC): void {
  playButton.disabled = true;
  try {
    const playerName = getPlayerName();
    cachePlayerName(playerName);
    engine.main();
    engine.Cmd_ExecuteString('_vgui_menus 0');
    if (!window.matchMedia('(hover: hover)').matches) engine.Cmd_ExecuteString('touch_enable 1');
    engine.Cmd_ExecuteString('name "' + playerName + '"');
    // 127.0.0.1:8080 is the internal Xash WebRTC virtual endpoint, NOT the LAN IP.
    engine.Cmd_ExecuteString('connect 127.0.0.1:8080');
    removeDesktop();
    window.addEventListener('beforeunload', (event) => {
      event.preventDefault();
      event.returnValue = '';
    });
  } catch (error) {
    console.error('Failed to start game:', error);
    report('startError');
    playButton.disabled = false;
  }
}

void initApp();

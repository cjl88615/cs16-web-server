type Language = 'zh' | 'en';

const messages = {
  zh: {
    localNetwork: '局域网专用',
    heroTitle: '经典战场，即刻集结',
    heroDescription: '无需安装客户端。打开浏览器，与同事一起进入 CS 1.6 对战。',
    featureMultiplayer: '局域网联机',
    featureBot: '智能 BOT 补位',
    featureDesktop: '键鼠操作',
    quickStart: '快速开始',
    enterBattle: '进入战局',
    nameLabel: '您的游戏昵称',
    namePlaceholder: '输入昵称',
    preparingResources: '游戏资源',
    play: '进入游戏',
    howTo: '游戏说明',
    guideOne: '首次进入需要下载游戏资源，之后会尝试从浏览器缓存读取。',
    guideTwo: '同一局域网的同事打开相同地址，输入各自昵称即可加入。',
    guideThree: 'BOT 由游戏服务器配置；无人在线时也可以独自对战。',
    desktopNotice: '推荐使用电脑',
    desktopExplain: 'Chrome / Edge 浏览器，键盘与鼠标操作。',
    footer: '仅供内部局域网娱乐',
    initializing: '正在初始化游戏引擎…',
    gamefileCache: '读取浏览器缓存中的游戏资源…',
    gamefileDownload: '首次下载游戏资源，可能需要一点时间…',
    unpacking: '正在加载游戏资源',
    ready: '准备完成，可以进入游戏。',
    loadError: '加载失败，请检查网络连接、游戏资源和浏览器控制台，然后刷新重试。',
    startError: '启动失败，请刷新页面重试。'
  },
  en: {
    localNetwork: 'LOCAL NETWORK',
    heroTitle: 'CLASSIC BATTLE. READY TO PLAY.',
    heroDescription: 'No game installation needed. Join your teammates in a CS 1.6 match right from your browser.',
    featureMultiplayer: 'LAN multiplayer',
    featureBot: 'AI bot fill',
    featureDesktop: 'Keyboard & mouse',
    quickStart: 'Quick start',
    enterBattle: 'Join the game',
    nameLabel: 'Your player name',
    namePlaceholder: 'Enter nickname',
    preparingResources: 'Game resources',
    play: 'ENTER GAME',
    howTo: 'How to play',
    guideOne: 'The first visit downloads game resources; later visits may use browser cache.',
    guideTwo: 'Teammates on the same LAN can join using the same address.',
    guideThree: 'Bots are configured on the server, allowing solo play.',
    desktopNotice: 'Desktop recommended',
    desktopExplain: 'Use Chrome / Edge with a keyboard and mouse.',
    footer: 'For private LAN recreation only',
    initializing: 'Initializing the game engine…',
    gamefileCache: 'Reading cached game files…',
    gamefileDownload: 'Downloading game files on first visit…',
    unpacking: 'Loading game files',
    ready: 'Game ready. You can join now.',
    loadError: 'Unable to load. Check the network, game files and browser console, then refresh.',
    startError: 'Unable to launch. Please refresh and try again.'
  }
} as const;

export type MessageKey = keyof typeof messages.zh;
let language: Language = 'zh';

try {
  language = localStorage.getItem('cs16-language') === 'en' ? 'en' : 'zh';
} catch {
  // Browsers can disable storage; Chinese remains the default.
}

export function t(key: MessageKey): string {
  return messages[language][key];
}

function applyLanguage(): void {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n as MessageKey;
    if (key && key in messages.zh) {
      // Keep the hero title as two lines in Chinese, but avoid unsafe HTML injection.
      if (key === 'heroTitle') {
        element.textContent = t(key);
      } else {
        element.textContent = t(key);
      }
    }
  }
  for (const element of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const key = element.dataset.i18nPlaceholder as MessageKey;
    if (key && key in messages.zh) element.placeholder = t(key);
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-locale]')) {
    button.setAttribute('aria-pressed', String(button.dataset.locale === language));
  }
}

export function initLocale(onChange: () => void): void {
  applyLanguage();
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-locale]')) {
    button.addEventListener('click', () => {
      const next = button.dataset.locale;
      if (next !== 'zh' && next !== 'en') return;
      language = next;
      try { localStorage.setItem('cs16-language', next); } catch { /* optional */ }
      applyLanguage();
      onChange();
    });
  }
}

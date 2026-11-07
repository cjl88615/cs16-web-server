const PLAYER_NAME_KEY = 'player-name';
const playerNameInput = document.getElementById('player-name-input') as HTMLInputElement;

try {
  const remembered = localStorage.getItem(PLAYER_NAME_KEY);
  if (remembered) playerNameInput.value = remembered;
} catch {
  // Private browsing may disable persistent storage.
}

export function getPlayerName(): string {
  // Prevent quotes, separators and control characters from becoming engine console commands.
  const cleaned = playerNameInput.value.trim().replace(/["\\;\r\n\t\u0000-\u001f\u007f]/g, '').slice(0, 24);
  return cleaned || 'Taliabu_Player';
}

export function cachePlayerName(playerName: string): void {
  try { localStorage.setItem(PLAYER_NAME_KEY, playerName); } catch { /* optional */ }
}

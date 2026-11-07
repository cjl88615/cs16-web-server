const PLAYER_NAME_KEY = 'player-name';
const encoder = new TextEncoder();
// GoldSrc names have a byte limit, not a JavaScript character limit.
export function normalizePlayerName(value: string): string {
  const clean = value.normalize('NFC').replace(/[";\\\x00-\x1f\x7f]/g, '').trim();
  let result = '';
  for (const character of clean) {
    if (encoder.encode(result + character).length > 31) break;
    result += character;
  }
  return result.trim();
}
export function savedPlayerName(): string {
  try { return normalizePlayerName(localStorage.getItem(PLAYER_NAME_KEY) || ''); }
  catch { return ''; }
}
export function cachePlayerName(value: string): void {
  try { localStorage.setItem(PLAYER_NAME_KEY, normalizePlayerName(value)); }
  catch { /* Storage restrictions must not stop a match. */ }
}

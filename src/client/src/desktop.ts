export function updateStatus(message: string): void {
  document.getElementById('loading-status')!.textContent = message;
}
export function updateProgress(value: number, max: number): void {
  const bar = document.getElementById('progress-bar') as HTMLProgressElement;
  if (!(max > 0)) { bar.removeAttribute('value'); return; }
  bar.max = max;
  bar.value = Math.max(0, Math.min(max, value));
}
export function storageNotice(message: string): void {
  const el = document.getElementById('storage-notice')!;
  el.textContent = message;
  el.hidden = false;
}
export function removeDesktop(): void {
  document.getElementById('desktop')!.hidden = true;
  document.getElementById('canvas')!.hidden = false;
  document.getElementById('menu-toggle')!.hidden = false;
}

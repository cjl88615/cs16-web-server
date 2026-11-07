const loadingStatus = document.getElementById('loading-status')!;
const progressBar = document.getElementById('progress-bar') as HTMLProgressElement;
const percentLabel = document.getElementById('progress-percent')!;
const desktop = document.getElementById('desktop')!;

export function updateStatus(message: string): void {
  loadingStatus.textContent = message;
}

export function updateProgress(value: number, max: number): void {
  progressBar.max = Math.max(1, max);
  progressBar.value = value;
  percentLabel.textContent = Math.min(100, Math.round((value / Math.max(1, max)) * 100)) + '%';
}

export function removeDesktop(): void {
  desktop.remove();
}

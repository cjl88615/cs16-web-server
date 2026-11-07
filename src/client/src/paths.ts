export function safeGamePath(name: string): boolean {
  return /^(valve|cstrike)\//.test(name) && !name.includes('\\') &&
    !name.includes('\0') && !name.split('/').some(part => part === '..' || part === '.');
}

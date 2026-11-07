const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePlayerName, savedPlayerName, cachePlayerName } = require('../.test-build/player.js');
const { safeGamePath } = require('../.test-build/paths.js');
test('nickname blocks console separators, quotes, backslashes and controls', () => {
  assert.equal(normalizePlayerName('  Bob";quit\\\n\r\t\x00  '), 'Bobquit');
  assert.equal(normalizePlayerName(' ;"\\\n '), '');
});
test('nickname preserves unicode without splitting UTF-8 characters', () => {
  const result = normalizePlayerName('中文'.repeat(30));
  assert.equal(new TextEncoder().encode(result).length, 30);
  assert.equal(normalizePlayerName('a'.repeat(100)).length, 31);
});
test('localStorage failure does not block play', () => {
  global.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(savedPlayerName(), ''); assert.doesNotThrow(() => cachePlayerName('Player'));
});
test('archive paths must remain inside game folders', () => {
  for (const path of ['cstrike/maps/de_dust2.bsp', 'valve/sound/test.wav']) assert.equal(safeGamePath(path), true, path);
  for (const path of ['../cstrike/a', '/cstrike/a', 'cstrike/../../evil', 'cstrike/./a', 'cstrike\\evil', 'other/a', 'cstrike/a\0']) assert.equal(safeGamePath(path), false, path);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, verifyPassword } from './auth.js';

test('auth.hashPassword generates compliant salt and derived key in hex format', async () => {
  const password = 'CorrectHorseBatteryStaple!123';
  const hash = await hashPassword(password);

  // Must match <32 hex chars (16 bytes salt)>:<128 hex chars (64 bytes scrypt key)>
  assert.match(hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
});

test('auth.hashPassword has high entropy: same password produces different salts and hashes (anti-rainbow/anti-gaming)', async () => {
  const password = 'MySecretPassword123';
  const hash1 = await hashPassword(password);
  const hash2 = await hashPassword(password);

  assert.notEqual(hash1, hash2, 'Two hashes of the same password must have distinct salts');
  const [salt1] = hash1.split(':');
  const [salt2] = hash2.split(':');
  assert.notEqual(salt1, salt2, 'Salts must be cryptographically random and unique');

  // Both distinct hashes must independently verify the original password
  assert.equal(await verifyPassword(password, hash1), true);
  assert.equal(await verifyPassword(password, hash2), true);
});

test('auth.verifyPassword correctly validates matching passwords and rejects incorrect ones', async () => {
  const password = 'ValidUserPassword99#';
  const hash = await hashPassword(password);

  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword('WrongPassword', hash), false);
  assert.equal(await verifyPassword(password.toLowerCase(), hash), false);
  assert.equal(await verifyPassword(password.toUpperCase(), hash), false);
  assert.equal(await verifyPassword(`${password} `, hash), false);
  assert.equal(await verifyPassword(` ${password}`, hash), false);
});

test('auth.verifyPassword handles Unicode and multi-byte edge cases properly', async () => {
  const unicodePassword = 'Senha-Segura-Com-Acentos-E-Emojis-🚀-ç-á-ñ';
  const hash = await hashPassword(unicodePassword);

  assert.equal(await verifyPassword(unicodePassword, hash), true);
  assert.equal(await verifyPassword('Senha-Segura-Com-Acentos-E-Emojis-🚀-ç-a-ñ', hash), false);
});

test('auth.verifyPassword tamper-resistance & anti-gaming: rejects mutated salts or keys', async () => {
  const password = 'StrictlyProtectedPassword10!';
  const hash = await hashPassword(password);
  const [salt, key] = hash.split(':');
  assert.ok(salt && key);

  // Flip the first character of the salt
  const tamperedSaltChar = salt[0] === 'a' ? 'b' : 'a';
  const tamperedSaltHash = `${tamperedSaltChar}${salt.slice(1)}:${key}`;
  assert.equal(await verifyPassword(password, tamperedSaltHash), false);

  // Flip the first character of the key
  const tamperedKeyChar = key[0] === 'a' ? 'b' : 'a';
  const tamperedKeyHash = `${salt}:${tamperedKeyChar}${key.slice(1)}`;
  assert.equal(await verifyPassword(password, tamperedKeyHash), false);
});

test('auth.verifyPassword anti-gaming: fails closed (returns false) without throwing on malformed inputs', async () => {
  const password = 'SafePassword123';
  const malformedInputs = [
    '',
    '   ',
    'not-a-hash',
    'admin:admin',
    ':',
    '::::',
    // Salt too short (31 hex chars)
    `${'a'.repeat(31)}:${'b'.repeat(128)}`,
    // Salt too long (33 hex chars)
    `${'a'.repeat(33)}:${'b'.repeat(128)}`,
    // Key too short (127 hex chars)
    `${'a'.repeat(32)}:${'b'.repeat(127)}`,
    // Key too long (129 hex chars)
    `${'a'.repeat(32)}:${'b'.repeat(129)}`,
    // Non-hex chars in salt
    `${'z'.repeat(32)}:${'b'.repeat(128)}`,
    // Non-hex chars in key
    `${'a'.repeat(32)}:${'g'.repeat(128)}`,
    // Trailing/leading garbage
    ` ${'a'.repeat(32)}:${'b'.repeat(128)} `,
  ];

  for (const input of malformedInputs) {
    const result = await verifyPassword(password, input);
    assert.equal(result, false, `Expected false for malformed hash: "${input}"`);
  }
});

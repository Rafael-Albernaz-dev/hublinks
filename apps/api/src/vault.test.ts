import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decryptCredential, encryptCredential, getMasterKey } from './vault.js';

test('vault.getMasterKey enforces 32-byte key contracts', () => {
  const originalEnv = process.env.VAULT_MASTER_KEY;
  try {
    delete process.env.VAULT_MASTER_KEY;
    const defaultKey = getMasterKey();
    assert.equal(defaultKey.length, 32);

    process.env.VAULT_MASTER_KEY = 'a'.repeat(64); // 64 hex = 32 bytes
    assert.equal(getMasterKey().length, 32);

    process.env.VAULT_MASTER_KEY = 'b'.repeat(32); // 32 raw bytes
    assert.equal(getMasterKey().length, 32);

    // Invalid length: 63 hex chars
    process.env.VAULT_MASTER_KEY = 'a'.repeat(63);
    assert.throws(() => getMasterKey(), /must be exactly 32 bytes/);

    // Invalid length: 31 raw bytes
    process.env.VAULT_MASTER_KEY = 'b'.repeat(31);
    assert.throws(() => getMasterKey(), /must be exactly 32 bytes/);
  } finally {
    if (originalEnv === undefined) {
      delete process.env.VAULT_MASTER_KEY;
    } else {
      process.env.VAULT_MASTER_KEY = originalEnv;
    }
  }
});

test('vault.encryptCredential and decryptCredential successfully roundtrip credentials', () => {
  const serviceId = 'partiu';
  const ownerUserId = null;
  const username = 'admin_user@provider.test';
  const password = 'SuperComplexPassword123#$!🚀';

  const encrypted = encryptCredential(username, password, serviceId, ownerUserId, 1);
  assert.equal(encrypted.iv.length, 12);
  assert.equal(encrypted.authTag.length, 16);
  assert.equal(encrypted.keyVersion, 1);

  const decrypted = decryptCredential(
    encrypted.encryptedUsername,
    encrypted.encryptedPassword,
    encrypted.iv,
    encrypted.authTag,
    serviceId,
    ownerUserId,
    1,
  );

  assert.equal(decrypted.username, username);
  assert.equal(decrypted.password, password);
});

test('vault handles boundary conditions: empty values, long strings, and Unicode', () => {
  const serviceId = 'fullcam';
  const ownerUserId = '8a3a936a-245f-4db3-8f0a-a1b2c3d4e5f6';

  const testCases = [
    { username: '', password: 'password-only' },
    { username: 'user-only', password: '' },
    { username: '', password: '' },
    { username: 'usuario_áéíóú_ç_ñ', password: 'senha_🔑_🚀_test' },
    { username: 'U'.repeat(1000), password: 'P'.repeat(4000) },
  ];

  for (const tc of testCases) {
    const enc = encryptCredential(tc.username, tc.password, serviceId, ownerUserId, 2);
    const dec = decryptCredential(
      enc.encryptedUsername,
      enc.encryptedPassword,
      enc.iv,
      enc.authTag,
      serviceId,
      ownerUserId,
      2,
    );
    assert.equal(dec.username, tc.username);
    assert.equal(dec.password, tc.password);
  }
});

test('vault anti-gaming: fails closed if ciphertext is tampered', () => {
  const serviceId = 'partiu';
  const ownerUserId = null;
  const enc = encryptCredential('user1', 'pass1', serviceId, ownerUserId, 1);

  // Tamper 1 byte in encryptedUsername
  const tamperedUsername = Buffer.from(enc.encryptedUsername);
  assert.ok(tamperedUsername.length > 0);
  tamperedUsername[0] = (tamperedUsername[0] as number) ^ 0x01;
  assert.throws(
    () =>
      decryptCredential(
        tamperedUsername,
        enc.encryptedPassword,
        enc.iv,
        enc.authTag,
        serviceId,
        ownerUserId,
        1,
      ),
    /Unsupported state or unable to authenticate data/,
  );

  // Tamper 1 byte in encryptedPassword
  const tamperedPassword = Buffer.from(enc.encryptedPassword);
  assert.ok(tamperedPassword.length > 0);
  tamperedPassword[0] = (tamperedPassword[0] as number) ^ 0x01;
  assert.throws(
    () =>
      decryptCredential(
        enc.encryptedUsername,
        tamperedPassword,
        enc.iv,
        enc.authTag,
        serviceId,
        ownerUserId,
        1,
      ),
    /Unsupported state or unable to authenticate data/,
  );
});

test('vault anti-gaming: fails closed if IV or authTag is tampered', () => {
  const serviceId = 'partiu';
  const ownerUserId = null;
  const enc = encryptCredential('user1', 'pass1', serviceId, ownerUserId, 1);

  // Tamper IV
  const tamperedIV = Buffer.from(enc.iv);
  assert.ok(tamperedIV.length > 0);
  tamperedIV[0] = (tamperedIV[0] as number) ^ 0x01;
  assert.throws(
    () =>
      decryptCredential(
        enc.encryptedUsername,
        enc.encryptedPassword,
        tamperedIV,
        enc.authTag,
        serviceId,
        ownerUserId,
        1,
      ),
    /Unsupported state or unable to authenticate data/,
  );

  // Tamper authTag
  const tamperedTag = Buffer.from(enc.authTag);
  assert.ok(tamperedTag.length > 0);
  tamperedTag[0] = (tamperedTag[0] as number) ^ 0x01;
  assert.throws(
    () =>
      decryptCredential(
        enc.encryptedUsername,
        enc.encryptedPassword,
        enc.iv,
        tamperedTag,
        serviceId,
        ownerUserId,
        1,
      ),
    /Unsupported state or unable to authenticate data/,
  );
});

test('vault anti-gaming: fails closed if AAD parameters (serviceId, ownerUserId, keyVersion) do not match exactly', () => {
  const serviceId = 'partiu';
  const ownerUserId = '99999999-9999-9999-9999-999999999999';
  const enc = encryptCredential('user1', 'pass1', serviceId, ownerUserId, 1);

  // Wrong serviceId
  assert.throws(
    () =>
      decryptCredential(
        enc.encryptedUsername,
        enc.encryptedPassword,
        enc.iv,
        enc.authTag,
        'other_service',
        ownerUserId,
        1,
      ),
    /Unsupported state or unable to authenticate data/,
  );

  // Wrong ownerUserId (cross-owner substitution attack)
  assert.throws(
    () =>
      decryptCredential(
        enc.encryptedUsername,
        enc.encryptedPassword,
        enc.iv,
        enc.authTag,
        serviceId,
        '88888888-8888-8888-8888-888888888888',
        1,
      ),
    /Unsupported state or unable to authenticate data/,
  );

  // Shared vs Individual substitution
  assert.throws(
    () =>
      decryptCredential(
        enc.encryptedUsername,
        enc.encryptedPassword,
        enc.iv,
        enc.authTag,
        serviceId,
        null, // tampered to shared
        1,
      ),
    /Unsupported state or unable to authenticate data/,
  );

  // Wrong keyVersion
  assert.throws(
    () =>
      decryptCredential(
        enc.encryptedUsername,
        enc.encryptedPassword,
        enc.iv,
        enc.authTag,
        serviceId,
        ownerUserId,
        2, // tampered key version
      ),
    /Unsupported state or unable to authenticate data/,
  );
});

test('vault anti-gaming: fails closed if decrypted with different master key', () => {
  const enc = encryptCredential('user1', 'pass1', 'partiu', null, 1);
  const differentKey = Buffer.from('f'.repeat(64), 'hex');

  assert.throws(
    () =>
      decryptCredential(
        enc.encryptedUsername,
        enc.encryptedPassword,
        enc.iv,
        enc.authTag,
        'partiu',
        null,
        1,
        differentKey,
      ),
    /Unsupported state or unable to authenticate data/,
  );
});

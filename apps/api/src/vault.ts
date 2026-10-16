import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const DEV_FALLBACK_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

export function getMasterKey(): Buffer {
  const envKey = process.env.VAULT_MASTER_KEY;
  if (!envKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('VAULT_MASTER_KEY is strictly required in production.');
    }
    return Buffer.from(DEV_FALLBACK_KEY, 'hex');
  }

  const trimmed = envKey.trim();
  // Validates 64-hex representation (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  // Alternatively validates raw 32-byte UTF-8 string
  const raw = Buffer.from(trimmed, 'utf8');
  if (raw.length === 32) {
    return raw;
  }

  throw new Error('VAULT_MASTER_KEY must be exactly 32 bytes (64 hex characters or 32 raw bytes).');
}

export function buildAAD(
  serviceId: string,
  ownerUserId: string | null,
  keyVersion: number,
): Buffer {
  return Buffer.from(`${serviceId}:${ownerUserId ?? 'shared'}:${keyVersion}`, 'utf8');
}

export type EncryptedVaultPayload = {
  encryptedUsername: Buffer;
  encryptedPassword: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
};

export function encryptCredential(
  username: string,
  password: string,
  serviceId: string,
  ownerUserId: string | null,
  keyVersion = 1,
  masterKey: Buffer = getMasterKey(),
): EncryptedVaultPayload {
  const uBytes = Buffer.from(username, 'utf8');
  const pBytes = Buffer.from(password, 'utf8');

  if (uBytes.length > 65535 || pBytes.length > 65535) {
    throw new Error('Username or password exceeds maximum supported payload length (64KB).');
  }

  // Frame 1: [version: 0x01 (1B)][len_u (2B BE)][...uBytes]
  const uHeader = Buffer.alloc(3);
  uHeader[0] = 0x01;
  uHeader.writeUInt16BE(uBytes.length, 1);
  const uPlaintext = Buffer.concat([uHeader, uBytes]);

  // Frame 2: [len_p (2B BE)][...pBytes]
  const pHeader = Buffer.alloc(2);
  pHeader.writeUInt16BE(pBytes.length, 0);
  const pPlaintext = Buffer.concat([pHeader, pBytes]);

  // Concatenate into a single continuous plaintext message
  const totalPlaintext = Buffer.concat([uPlaintext, pPlaintext]);

  const iv = randomBytes(12);
  const aad = buildAAD(serviceId, ownerUserId, keyVersion);

  const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([cipher.update(totalPlaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Split ciphertext strictly along the plaintext frame boundary
  const splitIndex = uPlaintext.length;
  const encryptedUsername = ciphertext.subarray(0, splitIndex);
  const encryptedPassword = ciphertext.subarray(splitIndex);

  return {
    encryptedUsername,
    encryptedPassword,
    iv,
    authTag,
    keyVersion,
  };
}

export function decryptCredential(
  encryptedUsername: Buffer,
  encryptedPassword: Buffer,
  iv: Buffer,
  authTag: Buffer,
  serviceId: string,
  ownerUserId: string | null,
  keyVersion: number,
  masterKey: Buffer = getMasterKey(),
): { username: string; password: string } {
  if (iv.length !== 12) {
    throw new Error('Invalid IV length: expected 12 bytes.');
  }
  if (authTag.length !== 16) {
    throw new Error('Invalid authentication tag length: expected 16 bytes.');
  }

  const ciphertext = Buffer.concat([encryptedUsername, encryptedPassword]);
  const aad = buildAAD(serviceId, ownerUserId, keyVersion);

  const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);

  // Authenticate and decrypt. Will throw if ciphertext, iv, authTag or AAD is modified.
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  if (plaintext.length < 5) {
    throw new Error('Malformed plaintext frame: length too small.');
  }

  const version = plaintext[0];
  if (version !== 0x01) {
    throw new Error(`Unsupported frame version: ${version}`);
  }

  const uLen = plaintext.readUInt16BE(1);
  const pOffset = 3 + uLen;
  if (plaintext.length < pOffset + 2) {
    throw new Error('Malformed plaintext frame: truncated username boundary.');
  }

  const username = plaintext.subarray(3, pOffset).toString('utf8');
  const pLen = plaintext.readUInt16BE(pOffset);
  const expectedTotalLen = pOffset + 2 + pLen;

  if (plaintext.length !== expectedTotalLen) {
    throw new Error('Malformed plaintext frame: length mismatch for password.');
  }

  const password = plaintext.subarray(pOffset + 2, expectedTotalLen).toString('utf8');
  return { username, password };
}

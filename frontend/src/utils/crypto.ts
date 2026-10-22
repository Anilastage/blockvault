const PBKDF2_ITERATIONS = 310_000;
const AES_KEY_BITS = 256;
const GCM_IV_BYTES = 12;
const SALT_BYTES = 16;
const BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export interface VaultBundle {
  version: number;
  publicKey: string;
  encryptedPrivateKey: string;
  privateKeyIv: string;
  passwordWrappedVaultKey: string;
  passwordWrapIv: string;
  recoveryWrappedVaultKey: string;
  recoveryWrapIv: string;
  keySalt: string;
  keyIterations: number;
}

export interface WrappedValue {
  data: string;
  iv: string;
}

export interface CreatedVault {
  bundle: VaultBundle;
  vaultKeyRaw: Uint8Array;
  privateKeyPkcs8: ArrayBuffer;
  recoveryPhrase: string;
  recoveryKeyRaw: Uint8Array;
}

export interface DecryptedVault {
  vaultKeyRaw: Uint8Array;
  privateKeyPkcs8: ArrayBuffer;
}

export const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const bytesToBase64Url = (bytes: Uint8Array): string =>
  bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const base64UrlToBytes = (value: string): Uint8Array => {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(padded + '='.repeat((4 - (padded.length % 4)) % 4));
};

const bufferSource = (bytes: Uint8Array): BufferSource =>
  bytes as unknown as BufferSource;

export const sha256Hex = async (data: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bufferSource(data));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const importAesKey = (raw: Uint8Array, extractable = false): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', bufferSource(raw), { name: 'AES-GCM', length: AES_KEY_BITS }, extractable, [
    'encrypt',
    'decrypt',
  ]);

const derivePasswordKey = async (
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: bufferSource(salt), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: AES_KEY_BITS },
    false,
    ['encrypt', 'decrypt']
  );
};

const encryptAes = async (key: CryptoKey, data: Uint8Array): Promise<WrappedValue> => {
  const iv = randomBytes(GCM_IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bufferSource(iv) }, key, bufferSource(data));
  return { data: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) };
};

const decryptAes = async (
  key: CryptoKey,
  ciphertextBase64: string,
  ivBase64: string
): Promise<Uint8Array> => {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bufferSource(base64ToBytes(ivBase64)) },
    key,
    bufferSource(base64ToBytes(ciphertextBase64))
  );
  return new Uint8Array(plaintext);
};

export const createPasswordEnvelope = async (
  vaultKeyRaw: Uint8Array,
  password: string
): Promise<{
  passwordWrappedVaultKey: string;
  passwordWrapIv: string;
  keySalt: string;
  keyIterations: number;
}> => {
  const salt = randomBytes(SALT_BYTES);
  const kek = await derivePasswordKey(password, salt, PBKDF2_ITERATIONS);
  const wrapped = await encryptAes(kek, vaultKeyRaw);
  return {
    passwordWrappedVaultKey: wrapped.data,
    passwordWrapIv: wrapped.iv,
    keySalt: bytesToBase64(salt),
    keyIterations: PBKDF2_ITERATIONS,
  };
};

export const unwrapVaultKeyWithPassword = async (
  bundle: Pick<
    VaultBundle,
    'passwordWrappedVaultKey' | 'passwordWrapIv' | 'keySalt' | 'keyIterations'
  >,
  password: string
): Promise<Uint8Array> => {
  const kek = await derivePasswordKey(
    password,
    base64ToBytes(bundle.keySalt),
    bundle.keyIterations
  );
  return decryptAes(kek, bundle.passwordWrappedVaultKey, bundle.passwordWrapIv);
};

export const bytesToRecoveryPhrase = (raw: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let encoded = '';
  for (const byte of raw) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) encoded += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return encoded.match(/.{1,4}/g)?.join('-') ?? encoded;
};

export const recoveryPhraseToBytes = (phrase: string): Uint8Array => {
  const clean = phrase
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('The recovery phrase contains an invalid character.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  if (bytes.length < 32) throw new Error('The recovery phrase is incomplete.');
  return new Uint8Array(bytes.slice(0, 32));
};

export const createRecoveryEnvelope = async (
  vaultKeyRaw: Uint8Array,
  recoveryKeyRaw?: Uint8Array
): Promise<WrappedValue & { recoveryKeyRaw: Uint8Array; recoveryPhrase: string }> => {
  const keyRaw = recoveryKeyRaw ?? randomBytes(32);
  const recoveryKey = await importAesKey(keyRaw);
  const wrapped = await encryptAes(recoveryKey, vaultKeyRaw);
  return {
    ...wrapped,
    recoveryKeyRaw: keyRaw,
    recoveryPhrase: bytesToRecoveryPhrase(keyRaw),
  };
};

export const unwrapVaultKeyWithRecovery = async (
  bundle: Pick<VaultBundle, 'recoveryWrappedVaultKey' | 'recoveryWrapIv'>,
  phrase: string
): Promise<Uint8Array> => {
  const recoveryKey = await importAesKey(recoveryPhraseToBytes(phrase));
  return decryptAes(recoveryKey, bundle.recoveryWrappedVaultKey, bundle.recoveryWrapIv);
};

const exportRsaKey = async (key: CryptoKey): Promise<string> => {
  const exported = await crypto.subtle.exportKey(
    key.type === 'public' ? 'spki' : 'pkcs8',
    key
  );
  return bytesToBase64(new Uint8Array(exported));
};

export const createVault = async (
  password: string,
  recoveryKeyRaw?: Uint8Array
): Promise<CreatedVault> => {
  const vaultKeyRaw = randomBytes(32);
  const vaultKey = await importAesKey(vaultKeyRaw);
  const passwordEnvelope = await createPasswordEnvelope(vaultKeyRaw, password);
  const recovery = await createRecoveryEnvelope(vaultKeyRaw, recoveryKeyRaw);

  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicKey = await exportRsaKey(keyPair.publicKey);
  const privateKeyPkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  const privateKeyWrapped = await encryptAes(vaultKey, new Uint8Array(privateKeyPkcs8));

  return {
    bundle: {
      version: 1,
      publicKey,
      encryptedPrivateKey: privateKeyWrapped.data,
      privateKeyIv: privateKeyWrapped.iv,
      passwordWrappedVaultKey: passwordEnvelope.passwordWrappedVaultKey,
      passwordWrapIv: passwordEnvelope.passwordWrapIv,
      recoveryWrappedVaultKey: recovery.data,
      recoveryWrapIv: recovery.iv,
      keySalt: passwordEnvelope.keySalt,
      keyIterations: passwordEnvelope.keyIterations,
    },
    vaultKeyRaw,
    privateKeyPkcs8,
    recoveryPhrase: recovery.recoveryPhrase,
    recoveryKeyRaw: recovery.recoveryKeyRaw,
  };
};

export const unlockVaultWithPassword = async (
  bundle: VaultBundle,
  password: string
): Promise<DecryptedVault> => {
  const vaultKeyRaw = await unwrapVaultKeyWithPassword(bundle, password);
  const vaultKey = await importAesKey(vaultKeyRaw);
  const privateKeyPkcs8 = await decryptAes(
    vaultKey,
    bundle.encryptedPrivateKey,
    bundle.privateKeyIv
  );
  return {
    vaultKeyRaw,
    privateKeyPkcs8: privateKeyPkcs8.buffer.slice(
      privateKeyPkcs8.byteOffset,
      privateKeyPkcs8.byteOffset + privateKeyPkcs8.byteLength
    ) as ArrayBuffer,
  };
};

export const importPrivateKey = (pkcs8: ArrayBuffer): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt']
  );

const importPublicKey = (spkiBase64: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'spki',
    bufferSource(base64ToBytes(spkiBase64)),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );

export const wrapKeyForPublicKey = async (
  rawKey: Uint8Array,
  publicKeyBase64: string
): Promise<string> => {
  const publicKey = await importPublicKey(publicKeyBase64);
  const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, bufferSource(rawKey));
  return bytesToBase64(new Uint8Array(wrapped));
};

export const unwrapKeyWithPrivateKey = async (
  wrappedBase64: string,
  privateKey: CryptoKey
): Promise<Uint8Array> => {
  const unwrapped = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    bufferSource(base64ToBytes(wrappedBase64))
  );
  return new Uint8Array(unwrapped);
};

export const wrapWithAesKey = async (
  rawKey: Uint8Array,
  wrappingKeyRaw: Uint8Array
): Promise<WrappedValue> => encryptAes(await importAesKey(wrappingKeyRaw), rawKey);

export const unwrapWithAesKey = async (
  wrappedBase64: string,
  ivBase64: string,
  wrappingKeyRaw: Uint8Array
): Promise<Uint8Array> =>
  decryptAes(await importAesKey(wrappingKeyRaw), wrappedBase64, ivBase64);

export const encryptFileBytes = async (
  bytes: Uint8Array,
  dekRaw: Uint8Array
): Promise<{ ciphertext: Uint8Array; iv: string }> => {
  const encrypted = await encryptAes(await importAesKey(dekRaw), bytes);
  return { ciphertext: base64ToBytes(encrypted.data), iv: encrypted.iv };
};

export const decryptFileBytes = async (
  ciphertext: Uint8Array,
  ivBase64: string,
  dekRaw: Uint8Array
): Promise<Uint8Array> => {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bufferSource(base64ToBytes(ivBase64)) },
    await importAesKey(dekRaw),
    bufferSource(ciphertext)
  );
  return new Uint8Array(plaintext);
};

export const encryptedBytesToBlob = (bytes: Uint8Array, mimeType: string): Blob =>
  new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: mimeType,
  });

export const PBKDF2_ITERATIONS_USED = PBKDF2_ITERATIONS;

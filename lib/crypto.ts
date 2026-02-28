const RSA_ALGO = {
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
} as const;

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API is unavailable in this runtime');
  }
  return subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return toArrayBuffer(base64ToBytes(base64));
}

export async function generateElectionKeypair(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const subtle = getSubtle();
  const keyPair = await subtle.generateKey(RSA_ALGO, true, ['encrypt', 'decrypt']);
  const publicKeyBytes = new Uint8Array(await subtle.exportKey('spki', keyPair.publicKey));
  const privateKeyBytes = new Uint8Array(await subtle.exportKey('pkcs8', keyPair.privateKey));

  return {
    publicKey: bytesToBase64(publicKeyBytes),
    privateKey: bytesToBase64(privateKeyBytes),
  };
}

export async function encryptVote(choice: string, publicKey: string): Promise<string> {
  const subtle = getSubtle();
  const key = await subtle.importKey(
    'spki',
    base64ToArrayBuffer(publicKey),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const plaintext = new TextEncoder().encode(choice);
  const ciphertext = await subtle.encrypt({ name: 'RSA-OAEP' }, key, plaintext);
  return bytesToBase64(new Uint8Array(ciphertext));
}

export async function decryptVote(ciphertext: string, privateKey: string): Promise<string> {
  const subtle = getSubtle();
  const key = await subtle.importKey(
    'pkcs8',
    base64ToArrayBuffer(privateKey),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['decrypt'],
  );
  const plaintext = await subtle.decrypt(
    { name: 'RSA-OAEP' },
    key,
    base64ToArrayBuffer(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export async function tallyVotes(
  encryptedVotes: string[],
  privateKey: string,
): Promise<Record<string, number>> {
  const results: Record<string, number> = {};

  for (const encryptedVote of encryptedVotes) {
    const choice = await decryptVote(encryptedVote, privateKey);
    results[choice] = (results[choice] ?? 0) + 1;
  }

  return results;
}

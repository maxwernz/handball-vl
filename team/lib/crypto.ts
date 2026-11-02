// Encryption for the internal statistics. Everything that leaves the team (the bundle on
// GitHub, upload payloads, stored uploads, the GitHub token) is AES-256-GCM encrypted
// with WebCrypto, which exists in browsers and Node alike. Password keys use PBKDF2.

export const PBKDF2_ITERATIONS = 600_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64: string) {
  const s = atob(b64.trim());
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export async function passwordKey(password: string, saltB64: string, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function rawKey(keyB64: string) {
  return crypto.subtle.importKey('raw', fromB64(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/** gzip + AES-GCM; result is "v1.<iv>.<ciphertext>" in base64. */
export async function seal(key: CryptoKey, value: unknown) {
  const iv = randomBytes(12);
  const packed = await pipe(enc.encode(JSON.stringify(value)), new CompressionStream('gzip'));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, packed as BufferSource));
  return `v1.${toB64(iv)}.${toB64(data)}`;
}

export class WrongKeyError extends Error {
  constructor() {
    super('Falsches Passwort');
  }
}

export async function open<T>(key: CryptoKey, sealed: string): Promise<T> {
  const [v, iv, data] = sealed.trim().split('.');
  if (v !== 'v1' || !iv || !data) throw new Error('Unbekanntes Datenformat');
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) as BufferSource }, key, fromB64(data) as BufferSource);
  } catch {
    throw new WrongKeyError();
  }
  return JSON.parse(dec.decode(await pipe(new Uint8Array(plain), new DecompressionStream('gzip')))) as T;
}

// Browser-side decryption of the facility offline data pack (WP-B4).
// Mirrors src/server/services/offline-pack.service.ts framing (keyVersion 1):
//   key        = HKDF-SHA256(ikm = work code, salt = first 16 bytes of
//                ciphertext, info = "medvex-offline-pack-v1", 32 bytes)
//   ciphertext = salt(16) ‖ AES-256-GCM body; authTag delivered separately.
// WebCrypto wants tag appended to the body, so we concatenate before decrypt.

const HKDF_INFO = "medvex-offline-pack-v1";
const SALT_LEN = 16;

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface EncryptedPackEnvelope {
  ciphertext: string; // base64: salt ‖ gcm body
  iv: string; // base64
  authTag: string; // base64
}

export async function decryptPackInBrowser<T = unknown>(
  code: string,
  envelope: EncryptedPackEnvelope,
): Promise<T> {
  const raw = b64ToBytes(envelope.ciphertext);
  const salt = raw.slice(0, SALT_LEN);
  const body = raw.slice(SALT_LEN);
  const iv = b64ToBytes(envelope.iv);
  const tag = b64ToBytes(envelope.authTag);

  const ikm = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(code.trim().toUpperCase()),
    "HKDF",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: new TextEncoder().encode(HKDF_INFO) },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const sealed = new Uint8Array(body.length + tag.length);
  sealed.set(body, 0);
  sealed.set(tag, body.length);

  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, sealed as BufferSource);
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

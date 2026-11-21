// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// At-rest encryption for provider API keys stored in localStorage. AES-256-GCM,
// with the key kept in IndexedDB. The goal: a stray process that scans the
// browser's storage files for key-shaped strings finds nothing. That is a step
// up from a plain-text file, but it doesn't stop a targeted attack: the
// decryption key lives in the same browser profile, and script running in this
// page can always ask for a decrypt.
//
// On secure pages (HTTPS, localhost) the key is a non-extractable Web Crypto
// key. On plain HTTP at a network address (the chat UI opened from another
// device) browsers withhold `crypto.subtle`, so a pure-JS AES-GCM
// (@noble/ciphers) runs instead and the key's raw bytes sit in IndexedDB. It
// guards against the same scraping. Separately, the page itself is then sent
// unencrypted, so anyone on the network could alter it. A stored CryptoKey is
// never overwritten: without Web Crypto it just can't be used until it's back.

import { openDB, type IDBPDatabase } from "idb";

const ENVELOPE_PREFIX = "enc:v1:";
const DB_NAME = "producer-pal-crypto";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const KEY_ID = "api-key-encryption-key";
const IV_BYTES = 12;
const KEY_BYTES = 32; // AES-256

// What's kept in IndexedDB: a CryptoKey (secure pages) or raw bytes (insecure).
type StoredKey = CryptoKey | Uint8Array;

// The key in the form the active path uses.
type KeyHandle =
  | { kind: "subtle"; key: CryptoKey }
  | { kind: "raw"; bytes: Uint8Array };

let keyPromise: Promise<KeyHandle> | null = null;

/**
 * Encrypt a plaintext API key into an `enc:v1:<base64 iv>:<base64 ciphertext>`
 * envelope. An empty string passes through unchanged (nothing to protect).
 * @param plain - Cleartext API key
 * @returns Encrypted envelope, or "" when given ""
 * @throws If no usable key can be loaded or stored
 */
export async function encryptApiKey(plain: string): Promise<string> {
  if (plain === "") {
    return "";
  }

  const handle = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await aesGcm(
    handle,
    iv,
    new TextEncoder().encode(plain),
    true,
  );

  return `${ENVELOPE_PREFIX}${toBase64(iv)}:${toBase64(ciphertext)}`;
}

/**
 * Decrypt an `enc:v1:` envelope back to plaintext. Any value lacking the
 * `enc:v1:` prefix is treated as legacy cleartext and returned unchanged — this
 * is the migration path for keys saved before encryption (they get re-encrypted
 * on the next save).
 *
 * Decryption failures NEVER reject: an unrecoverable envelope (most often the
 * IndexedDB CryptoKey was regenerated or cleared while this localStorage
 * envelope persisted) resolves to "". This keeps one bad key contained — it
 * reads as "not set" (prompting re-entry) instead of rejecting and blanking
 * every provider's key via the `Promise.all` in `loadAllProviderSettingsAsync`.
 * @param value - Stored value (encrypted envelope or legacy cleartext)
 * @returns Cleartext API key, or "" when the envelope can't be decrypted
 */
export async function decryptApiKey(value: string): Promise<string> {
  if (!value.startsWith(ENVELOPE_PREFIX)) {
    return value;
  }

  const [ivB64, ciphertextB64] = value.slice(ENVELOPE_PREFIX.length).split(":");

  if (ivB64 == null || ciphertextB64 == null) {
    return value;
  }

  try {
    const handle = await getOrCreateKey();
    const plaintext = await aesGcm(
      handle,
      fromBase64(ivB64),
      fromBase64(ciphertextB64),
      false,
    );

    return new TextDecoder().decode(plaintext);
  } catch (err) {
    console.warn("Failed to decrypt stored API key; treating as unset", err);

    return "";
  }
}

/**
 * Whether a stored value is an encrypted envelope (vs legacy cleartext).
 * @param value - Stored value
 * @returns True when the value is an `enc:v1:` envelope
 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(ENVELOPE_PREFIX);
}

/**
 * Clear the in-memory cached key promise. Used in tests to force a re-read from
 * IndexedDB and verify key persistence.
 */
export function resetKeyCache(): void {
  keyPromise = null;
}

// --- Helpers below main exports ---

/**
 * Whether the page can use Web Crypto. Browsers leave `crypto.subtle`
 * undefined on pages that aren't a secure context (plain HTTP at a network
 * address). `crypto.getRandomValues` is available either way.
 * @returns True when `crypto.subtle` exists
 */
function hasSubtleCrypto(): boolean {
  // Typed as always present; it's undefined on insecure pages.
  return (crypto.subtle as SubtleCrypto | undefined) != null;
}

/**
 * Run AES-GCM with whichever implementation the key's form calls for. Both
 * produce the same ciphertext-then-tag layout, so envelopes are interchangeable.
 * @param handle - The key
 * @param iv - 12-byte nonce
 * @param data - Plaintext to encrypt, or ciphertext to decrypt
 * @param encrypt - True to encrypt, false to decrypt
 * @returns The result bytes
 */
async function aesGcm(
  handle: KeyHandle,
  iv: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
  encrypt: boolean,
): Promise<Uint8Array<ArrayBuffer>> {
  if (handle.kind === "subtle") {
    const params = { name: "AES-GCM", iv };
    const out = encrypt
      ? await crypto.subtle.encrypt(params, handle.key, data)
      : await crypto.subtle.decrypt(params, handle.key, data);

    return new Uint8Array(out);
  }

  // Loaded only on pages without Web Crypto, so it stays out of the main bundle.
  const { gcm } = await import("@noble/ciphers/aes.js");
  const cipher = gcm(handle.bytes, iv);

  return new Uint8Array(encrypt ? cipher.encrypt(data) : cipher.decrypt(data));
}

/**
 * Get the cached encryption key, loading or generating and persisting it in
 * IndexedDB on first use. Subsequent calls return the same key for the lifetime
 * of the page.
 * @returns The key
 */
function getOrCreateKey(): Promise<KeyHandle> {
  if (keyPromise == null) {
    const loading = loadOrGenerateKey();

    keyPromise = loading;
    // Don't cache a failure: the next call tries again.
    loading.catch(() => {
      if (keyPromise === loading) {
        keyPromise = null;
      }
    });
  }

  return keyPromise;
}

/**
 * Read the stored key from IndexedDB, or generate and persist one if there is
 * none (or the stored bytes are the wrong length).
 * @returns The key
 */
async function loadOrGenerateKey(): Promise<KeyHandle> {
  const existing = await toHandle(await readKey());

  if (existing != null) {
    return existing;
  }

  const candidate: StoredKey = hasSubtleCrypto()
    ? await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false, // non-extractable: cannot be read back out as raw bytes
        ["encrypt", "decrypt"],
      )
    : crypto.getRandomValues(new Uint8Array(KEY_BYTES));

  // The stored value is usable here: it's our candidate or one from a racing tab.
  return (await toHandle(await storeKeyIfUsable(candidate))) as KeyHandle;
}

/**
 * Turn a stored key into the form the active path can use. Raw bytes are
 * imported when Web Crypto exists. Raw bytes of the wrong length are no key.
 * @param stored - Stored value, if any
 * @returns The usable key, or null when there is none
 * @throws If the stored key is a CryptoKey and this page has no Web Crypto
 */
async function toHandle(stored: StoredKey | null): Promise<KeyHandle | null> {
  if (stored == null) {
    return null;
  }

  if (!ArrayBuffer.isView(stored)) {
    // Never overwrite it: it works again once Web Crypto is back.
    if (!hasSubtleCrypto()) {
      throw new Error("The stored key needs Web Crypto, which is unavailable");
    }

    return { kind: "subtle", key: stored };
  }

  if (stored.byteLength !== KEY_BYTES) {
    return null;
  }

  if (!hasSubtleCrypto()) {
    return { kind: "raw", bytes: stored };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    stored as Uint8Array<ArrayBuffer>,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );

  return { kind: "subtle", key };
}

/**
 * Read the persisted key from IndexedDB.
 * @returns The stored key, or null if none exists
 */
async function readKey(): Promise<StoredKey | null> {
  const db = await openCryptoDb();

  try {
    const result = (await db.get(STORE_NAME, KEY_ID)) as StoredKey | undefined;

    return result ?? null;
  } finally {
    db.close();
  }
}

/**
 * Persist a key unless another tab stored a usable one first. The check and
 * the write share one transaction, so only one writer wins and every tab ends
 * up using the same key. A CryptoKey is structured-cloneable, so a
 * non-extractable key round-trips through IndexedDB without exposing bytes.
 * Only a missing key or raw bytes of the wrong length get replaced; a stored
 * CryptoKey is never overwritten.
 * @param key - The key to store
 * @returns The key that is now stored: the existing one if it's usable
 */
async function storeKeyIfUsable(key: StoredKey): Promise<StoredKey> {
  const db = await openCryptoDb();

  try {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const existing = (await tx.store.get(KEY_ID)) as StoredKey | undefined;

    if (
      existing != null &&
      (!ArrayBuffer.isView(existing) || existing.byteLength === KEY_BYTES)
    ) {
      await tx.done;

      return existing;
    }

    await tx.store.put(key, KEY_ID);
    await tx.done;

    return key;
  } finally {
    db.close();
  }
}

/**
 * Open (and upgrade if needed) the dedicated crypto-key IndexedDB database.
 * Kept separate from the conversation DB to avoid version coupling.
 * @returns The opened database
 */
function openCryptoDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

/**
 * Base64-encode a byte array.
 * @param bytes - Bytes to encode
 * @returns Base64 string
 */
function toBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/**
 * Decode a base64 string into bytes. Returns an ArrayBuffer-backed Uint8Array
 * so it satisfies the Web Crypto BufferSource type.
 * @param base64 - Base64 string
 * @returns Decoded bytes
 */
function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// At-rest encryption for provider API keys stored in localStorage. Keys are
// encrypted with a non-extractable AES-GCM CryptoKey persisted in IndexedDB, so
// the plaintext never sits in localStorage. This is an interim stopgap for the
// localhost/own-key threat model — it is NOT a substitute for OS-level
// protection (an attacker with code-execution in this origin can still ask the
// non-extractable key to decrypt). The real fix is a future backend move.

import { openDB, type IDBPDatabase } from "idb";

const ENVELOPE_PREFIX = "enc:v1:";
const DB_NAME = "producer-pal-crypto";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const KEY_ID = "api-key-encryption-key";
const IV_BYTES = 12;

let keyPromise: Promise<CryptoKey> | null = null;

/**
 * Encrypt a plaintext API key into an `enc:v1:<base64 iv>:<base64 ciphertext>`
 * envelope. An empty string passes through unchanged (nothing to protect).
 * @param plain - Cleartext API key
 * @returns Encrypted envelope, or "" when given ""
 */
export async function encryptApiKey(plain: string): Promise<string> {
  if (plain === "") return "";

  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );

  return `${ENVELOPE_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
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
  if (!value.startsWith(ENVELOPE_PREFIX)) return value;

  const [ivB64, ciphertextB64] = value.slice(ENVELOPE_PREFIX.length).split(":");

  if (ivB64 == null || ciphertextB64 == null) return value;

  try {
    const key = await getOrCreateKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(ivB64) },
      key,
      fromBase64(ciphertextB64),
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
 * Get the cached encryption key, generating and persisting a new
 * non-extractable AES-GCM key in IndexedDB on first use. Subsequent calls
 * return the same key for the lifetime of the page.
 * @returns The AES-GCM CryptoKey
 */
function getOrCreateKey(): Promise<CryptoKey> {
  keyPromise ??= loadOrGenerateKey();

  return keyPromise;
}

/**
 * Read the stored key from IndexedDB, or generate and persist one if absent.
 * @returns The AES-GCM CryptoKey
 */
async function loadOrGenerateKey(): Promise<CryptoKey> {
  const existing = await readKey();

  if (existing != null) return existing;

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: cannot be read back out as raw bytes
    ["encrypt", "decrypt"],
  );

  await writeKey(key);

  return key;
}

/**
 * Read the persisted CryptoKey from IndexedDB.
 * @returns The stored key, or null if none exists
 */
async function readKey(): Promise<CryptoKey | null> {
  const db = await openCryptoDb();

  try {
    const result = (await db.get(STORE_NAME, KEY_ID)) as CryptoKey | undefined;

    return result ?? null;
  } finally {
    db.close();
  }
}

/**
 * Persist a CryptoKey to IndexedDB. CryptoKey objects are structured-cloneable,
 * so a non-extractable key round-trips through IndexedDB without exposing bytes.
 * @param key - The key to store
 */
async function writeKey(key: CryptoKey): Promise<void> {
  const db = await openCryptoDb();

  try {
    await db.put(STORE_NAME, key, KEY_ID);
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

  for (const byte of bytes) binary += String.fromCharCode(byte);

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

  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return bytes;
}

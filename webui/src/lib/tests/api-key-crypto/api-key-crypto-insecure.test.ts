// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptApiKey,
  encryptApiKey,
  resetKeyCache,
} from "#webui/lib/api-key-crypto";
import { deleteIndexedDb } from "#webui/test-utils/indexeddb-test-helpers";

const DB_NAME = "producer-pal-crypto";
const KEY_ID = "api-key-encryption-key";

/** Make the page look insecure: Web Crypto is gone, getRandomValues stays. */
function hideSubtleCrypto(): void {
  vi.stubGlobal("crypto", {
    getRandomValues: crypto.getRandomValues.bind(crypto),
  });
}

/**
 * Read the key stored in IndexedDB.
 * @returns The stored value
 */
async function readStoredKey(): Promise<unknown> {
  const db = await openDB(DB_NAME, 1);
  const stored = await db.get("keys", KEY_ID);

  db.close();

  return stored;
}

/**
 * Store a value as the key in IndexedDB.
 * @param value - Value to store
 */
async function putStoredKey(value: unknown): Promise<void> {
  const db = await openDB(DB_NAME, 1, {
    upgrade: (d) => d.createObjectStore("keys"),
  });

  await db.put("keys", value, KEY_ID);
  db.close();
}

describe("api-key-crypto without crypto.subtle (plain HTTP page)", () => {
  beforeEach(async () => {
    resetKeyCache();
    await deleteIndexedDb(DB_NAME);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("round-trips a key with the pure-JS path", async () => {
    hideSubtleCrypto();

    const encrypted = await encryptApiKey("sk-plain-http");

    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(encrypted).not.toContain("sk-plain-http");
    expect(await decryptApiKey(encrypted)).toBe("sk-plain-http");
  });

  it("round-trips unicode and uses a fresh IV per call", async () => {
    hideSubtleCrypto();

    const a = await encryptApiKey("clé-🔐");
    const b = await encryptApiKey("clé-🔐");

    expect(a).not.toBe(b);
    expect(await decryptApiKey(a)).toBe("clé-🔐");
  });

  it("stores a 32-byte raw key and reuses it after a reload", async () => {
    hideSubtleCrypto();

    const encrypted = await encryptApiKey("sk-persist");
    const stored = await readStoredKey();

    expect(ArrayBuffer.isView(stored)).toBe(true);
    expect(stored as Uint8Array).toHaveLength(32);

    resetKeyCache();

    expect(await decryptApiKey(encrypted)).toBe("sk-persist");
  });

  it("passes empty and legacy cleartext values through", async () => {
    hideSubtleCrypto();

    expect(await encryptApiKey("")).toBe("");
    expect(await decryptApiKey("")).toBe("");
    expect(await decryptApiKey("AIza-legacy")).toBe("AIza-legacy");
  });

  it("never rejects: an envelope from another key reads as ''", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    hideSubtleCrypto();

    const encrypted = await encryptApiKey("sk-orphaned");

    resetKeyCache();
    await deleteIndexedDb(DB_NAME);

    expect(await decryptApiKey(encrypted)).toBe("");
  });

  it("uses a raw key that is already stored", async () => {
    hideSubtleCrypto();

    // E.g. another tab stored its key first.
    const otherTabKey = new Uint8Array(32).fill(7);

    await putStoredKey(otherTabKey);

    const encrypted = await encryptApiKey("sk-shared");

    resetKeyCache();

    expect(await decryptApiKey(encrypted)).toBe("sk-shared");
    expect(await readStoredKey()).toStrictEqual(otherTabKey);
  });

  it("never overwrites a stored CryptoKey: it works again once crypto.subtle is back", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Written on a secure page: a CryptoKey.
    const secure = await encryptApiKey("sk-from-secure-page");
    const stored = await readStoredKey();

    expect(stored).toBeInstanceOf(CryptoKey);

    resetKeyCache();
    hideSubtleCrypto();

    await expect(encryptApiKey("sk-new")).rejects.toThrow("needs Web Crypto");
    expect(await decryptApiKey(secure)).toBe("");
    expect(await readStoredKey()).toBeInstanceOf(CryptoKey);

    // Back on a secure page, the old envelope reads again.
    vi.unstubAllGlobals();

    expect(await decryptApiKey(secure)).toBe("sk-from-secure-page");
  });

  it("treats a stored key of the wrong length as no key and replaces it", async () => {
    hideSubtleCrypto();
    await putStoredKey(new Uint8Array(16));

    const encrypted = await encryptApiKey("sk-after-bad-key");
    const stored = await readStoredKey();

    expect(stored as Uint8Array).toHaveLength(32);

    resetKeyCache();

    expect(await decryptApiKey(encrypted)).toBe("sk-after-bad-key");
  });
});

describe("api-key-crypto: raw key on a page that has crypto.subtle", () => {
  beforeEach(async () => {
    resetKeyCache();
    await deleteIndexedDb(DB_NAME);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("imports a raw key stored by the pure-JS path and reads its envelopes", async () => {
    hideSubtleCrypto();

    const encrypted = await encryptApiKey("sk-from-http-page");

    vi.unstubAllGlobals();
    resetKeyCache();

    // The same origin now has Web Crypto: the raw bytes are imported.
    expect(await decryptApiKey(encrypted)).toBe("sk-from-http-page");
    expect(ArrayBuffer.isView(await readStoredKey())).toBe(true);
  });

  it("writes envelopes the pure-JS path can read (one format)", async () => {
    hideSubtleCrypto();
    await encryptApiKey("seed"); // stores a raw key
    vi.unstubAllGlobals();
    resetKeyCache();

    const encrypted = await encryptApiKey("sk-from-subtle");

    resetKeyCache();
    hideSubtleCrypto();

    expect(await decryptApiKey(encrypted)).toBe("sk-from-subtle");
  });

  it("replaces a stored key of the wrong length with a working one", async () => {
    await putStoredKey(new Uint8Array(16));

    const encrypted = await encryptApiKey("sk-after-bad-key");

    resetKeyCache();

    expect(await decryptApiKey(encrypted)).toBe("sk-after-bad-key");
  });

  it("does not cache a failed key load: the next call retries", async () => {
    const original = crypto.subtle.generateKey.bind(crypto.subtle);

    vi.spyOn(crypto.subtle, "generateKey").mockRejectedValueOnce(
      new Error("boom"),
    );

    await expect(encryptApiKey("sk-retry")).rejects.toThrow("boom");

    vi.spyOn(crypto.subtle, "generateKey").mockImplementation(original);

    expect(await decryptApiKey(await encryptApiKey("sk-retry"))).toBe(
      "sk-retry",
    );
  });
});

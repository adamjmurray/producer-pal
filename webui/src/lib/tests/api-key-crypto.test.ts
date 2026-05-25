// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptApiKey,
  encryptApiKey,
  isEncrypted,
  resetKeyCache,
} from "#webui/lib/api-key-crypto";

const DB_NAME = "producer-pal-crypto";

/**
 * Delete the crypto-key database so each test starts with a fresh key.
 */
async function deleteCryptoDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

describe("api-key-crypto", () => {
  beforeEach(async () => {
    resetKeyCache();
    await deleteCryptoDb();
  });

  describe("encryptApiKey / decryptApiKey round-trip", () => {
    it("decrypts an encrypted key back to the original plaintext", async () => {
      const plain = "sk-test-1234567890";
      const encrypted = await encryptApiKey(plain);

      expect(await decryptApiKey(encrypted)).toBe(plain);
    });

    it("produces an enc:v1:-prefixed envelope that differs from plaintext", async () => {
      const plain = "sk-secret-abcdef";
      const encrypted = await encryptApiKey(plain);

      expect(encrypted.startsWith("enc:v1:")).toBe(true);
      expect(encrypted).not.toBe(plain);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("uses a fresh IV per call (same plaintext yields different ciphertext)", async () => {
      const plain = "sk-repeat";
      const a = await encryptApiKey(plain);
      const b = await encryptApiKey(plain);

      expect(a).not.toBe(b);
      expect(await decryptApiKey(a)).toBe(plain);
      expect(await decryptApiKey(b)).toBe(plain);
    });

    it("round-trips unicode content", async () => {
      const plain = "clé-secrète-🔐-密钥";
      const encrypted = await encryptApiKey(plain);

      expect(await decryptApiKey(encrypted)).toBe(plain);
    });
  });

  describe("empty / passthrough handling", () => {
    it("passes an empty string through encrypt unchanged", async () => {
      expect(await encryptApiKey("")).toBe("");
    });

    it("passes an empty string through decrypt unchanged", async () => {
      expect(await decryptApiKey("")).toBe("");
    });

    it("passes a legacy cleartext value through decrypt unchanged (migration)", async () => {
      const legacy = "AIzaSy-legacy-cleartext-key";

      expect(await decryptApiKey(legacy)).toBe(legacy);
    });

    it("treats a malformed envelope (missing parts) as passthrough", async () => {
      const malformed = "enc:v1:onlyonepart";

      expect(await decryptApiKey(malformed)).toBe(malformed);
    });
  });

  describe("undecryptable envelope handling", () => {
    it("resolves to '' (never rejects) when the encryption key was replaced", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Encrypt under one key, then wipe it: the next decrypt generates a fresh
      // key and the AES-GCM auth check fails. This is the real-world cause of
      // finding #3 — IndexedDB cleared while the localStorage envelope persists.
      const encrypted = await encryptApiKey("sk-orphaned-by-key-loss");

      resetKeyCache();
      await deleteCryptoDb();

      expect(await decryptApiKey(encrypted)).toBe("");
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("isEncrypted", () => {
    it("returns false for legacy cleartext", () => {
      expect(isEncrypted("sk-cleartext")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isEncrypted("")).toBe(false);
    });
  });

  describe("key persistence", () => {
    it("reuses the same key across cache resets (decrypts after reload)", async () => {
      const plain = "sk-persistent-key";
      const encrypted = await encryptApiKey(plain);

      // Simulate a page reload: drop the in-memory cache, forcing a re-read of
      // the persisted key from IndexedDB.
      resetKeyCache();

      expect(await decryptApiKey(encrypted)).toBe(plain);
    });

    it("a value encrypted before reset decrypts after a second reset", async () => {
      const plain = "sk-double-reset";
      const encrypted = await encryptApiKey(plain);

      resetKeyCache();
      expect(await decryptApiKey(encrypted)).toBe(plain);

      resetKeyCache();
      expect(await decryptApiKey(encrypted)).toBe(plain);
    });
  });
});

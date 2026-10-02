// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { openDB } from "idb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptApiKey,
  encryptApiKey,
  isEncrypted,
  resetKeyCache,
} from "#webui/lib/api-key-crypto";
import { deleteIndexedDb } from "#webui/test-utils/indexeddb-test-helpers";

const DB_NAME = "producer-pal-crypto";

describe("api-key-crypto", () => {
  beforeEach(async () => {
    resetKeyCache();
    // Delete the crypto-key database so each test starts with a fresh key.
    await deleteIndexedDb(DB_NAME);
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
      await deleteIndexedDb(DB_NAME);

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

  describe("two tabs creating the first key", () => {
    it("keeps the key another tab stored first, so its envelopes still decrypt", async () => {
      const generate = crypto.subtle.generateKey.bind(crypto.subtle);
      const otherTabKey = (await generate(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      )) as CryptoKey;
      const iv = new Uint8Array(12);
      const otherTabCipher = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        otherTabKey,
        new TextEncoder().encode("other-tab-secret"),
      );

      // The other tab stores its key while this tab is still generating.
      vi.spyOn(crypto.subtle, "generateKey").mockImplementationOnce(
        async (...args: Parameters<typeof generate>) => {
          const db = await openDB(DB_NAME, 1, {
            upgrade: (d) => d.createObjectStore("keys"),
          });

          await db.put("keys", otherTabKey, "api-key-encryption-key");
          db.close();

          return await generate(...args);
        },
      );

      const mine = await encryptApiKey("my-secret");

      resetKeyCache();

      expect(await decryptApiKey(mine)).toBe("my-secret");

      const db = await openDB(DB_NAME, 1);
      const stored = (await db.get(
        "keys",
        "api-key-encryption-key",
      )) as CryptoKey;

      db.close();

      const roundTrip = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        stored,
        otherTabCipher,
      );

      expect(new TextDecoder().decode(roundTrip)).toBe("other-tab-secret");
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptApiKey, resetKeyCache } from "#webui/lib/api-key-crypto";
import { deleteIndexedDb } from "#webui/test-utils/indexeddb-test-helpers";

describe("api-key-crypto after the key cache is reset mid-load", () => {
  beforeEach(async () => {
    resetKeyCache();
    await deleteIndexedDb("producer-pal-crypto");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the newer load when the discarded one fails afterwards", async () => {
    let failFirstLoad: (error: Error) => void = () => {};
    const generate = vi
      .spyOn(crypto.subtle, "generateKey")
      .mockImplementationOnce(
        () =>
          new Promise<CryptoKeyPair>((_resolve, reject) => {
            failFirstLoad = reject;
          }),
      );

    const discarded = encryptApiKey("sk-first");

    // The first load is now stuck generating its key.
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
    resetKeyCache();
    await encryptApiKey("sk-second");

    const open = vi.spyOn(indexedDB, "open");

    failFirstLoad(new Error("boom"));
    await expect(discarded).rejects.toThrow("boom");
    await encryptApiKey("sk-third");

    // The third call reused the second load's key instead of loading again.
    expect(open).not.toHaveBeenCalled();
  });
});

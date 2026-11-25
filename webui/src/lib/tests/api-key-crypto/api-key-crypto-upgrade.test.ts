// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// @vitest-environment happy-dom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createObjectStore = vi.hoisted(() => vi.fn());

// Replay the upgrade callback against a database that already has the store,
// as a schema bump over an existing database would.
vi.mock(import("idb"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    openDB: ((name, version, callbacks) => {
      callbacks?.upgrade?.(
        {
          objectStoreNames: { contains: () => true },
          createObjectStore,
        } as never,
        0,
        1,
        null as never,
        null as never,
      );

      return actual.openDB(name, version, callbacks);
    }) as typeof actual.openDB,
  };
});

import {
  decryptApiKey,
  encryptApiKey,
  resetKeyCache,
} from "#webui/lib/api-key-crypto";
import { deleteIndexedDb } from "#webui/test-utils/indexeddb-test-helpers";

describe("api-key-crypto database upgrade", () => {
  beforeEach(async () => {
    resetKeyCache();
    await deleteIndexedDb("producer-pal-crypto");
  });

  it("does not recreate a key store that already exists", async () => {
    const encrypted = await encryptApiKey("sk-upgrade");

    expect(await decryptApiKey(encrypted)).toBe("sk-upgrade");
    expect(createObjectStore).not.toHaveBeenCalled();
  });
});

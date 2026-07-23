// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  resetProjectContextSyncMemo,
  syncProjectContextBackup,
} from "../project-context-sync.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
}));

vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const { requestNode } =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");
const mockRequestNode = vi.mocked(requestNode);

const SAVED_PATH = "/Users/x/MySong Project/MySong.als";

/**
 * Register the mock live_set with a given file_path (null = unsaved).
 * @param filePath - The file_path the mock live_set should report (null = unsaved)
 */
function setFilePath(filePath: string | null): void {
  registerMockObject("live_set", {
    path: "live_set",
    properties: { file_path: filePath ?? "" },
  });
}

/**
 * Make the next projectContext.sync resolve as a given route action.
 * @param action - The action the mocked route should report
 * @param content - Restored content to include (for the restore action)
 */
function mockSyncResult(
  action: "restore" | "backup" | "clear" | "none",
  content?: string,
): void {
  mockRequestNode.mockResolvedValueOnce({
    success: true,
    result: content == null ? { action } : { action, content },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetProjectContextSyncMemo();
});

afterEach(() => {
  resetProjectContextSyncMemo();
});

describe("syncProjectContextBackup — unsaved set", () => {
  it("skips the Node round-trip entirely when the set is unsaved", async () => {
    setFilePath(null);

    const restored = await syncProjectContextBackup("some context");

    expect(restored).toBeNull();
    expect(mockRequestNode).not.toHaveBeenCalled();
  });
});

describe("syncProjectContextBackup — backup", () => {
  it("syncs on the first call and passes filePath + content", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("backup");

    const restored = await syncProjectContextBackup("Genre: jungle");

    expect(restored).toBeNull();
    // First sync of the session ⇒ allowRestore true.
    expect(mockRequestNode).toHaveBeenCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "Genre: jungle",
      allowRestore: true,
    });
  });

  it("does not round-trip again when nothing changed", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("backup");
    await syncProjectContextBackup("Genre: jungle");

    await syncProjectContextBackup("Genre: jungle");

    expect(mockRequestNode).toHaveBeenCalledTimes(1);
  });

  it("re-syncs when the content changes", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("backup");
    await syncProjectContextBackup("Genre: jungle");
    mockSyncResult("backup");

    await syncProjectContextBackup("Genre: techno");

    expect(mockRequestNode).toHaveBeenCalledTimes(2);
  });

  it("re-syncs when the file_path changes (Save-As to a new folder)", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("backup");
    await syncProjectContextBackup("Genre: jungle");
    setFilePath("/Users/x/Copy Project/Copy.als");
    mockSyncResult("backup");

    await syncProjectContextBackup("Genre: jungle");

    expect(mockRequestNode).toHaveBeenCalledTimes(2);
    // Second sync of the session ⇒ allowRestore false.
    expect(mockRequestNode).toHaveBeenLastCalledWith("projectContext.sync", {
      filePath: "/Users/x/Copy Project/Copy.als",
      content: "Genre: jungle",
      allowRestore: false,
    });
  });
});

describe("syncProjectContextBackup — restore", () => {
  it("returns the restored blob so the caller re-persists it", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("restore", "Restored from disk");

    const restored = await syncProjectContextBackup("");

    expect(restored).toBe("Restored from disk");
  });

  it("memoizes the restored content so it does not re-sync immediately", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("restore", "Restored from disk");
    await syncProjectContextBackup("");

    // Caller applied the restore to the param; next call sees that content.
    await syncProjectContextBackup("Restored from disk");

    expect(mockRequestNode).toHaveBeenCalledTimes(1);
  });

  it("treats a restore action with no content as an empty restore", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("restore");

    const restored = await syncProjectContextBackup("");

    expect(restored).toBe("");
  });
});

describe("syncProjectContextBackup — allowRestore gating", () => {
  it("sends allowRestore:false once a sync has completed (an in-session clear)", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("backup");
    await syncProjectContextBackup("Genre: jungle");

    // User clears the project context; the next sync must not restore.
    mockSyncResult("clear");
    const restored = await syncProjectContextBackup("");

    expect(restored).toBeNull();
    expect(mockRequestNode).toHaveBeenLastCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "",
      allowRestore: false,
    });
  });
});

describe("syncProjectContextBackup — Live API not ready", () => {
  it("returns null without a round-trip when reading file_path throws", async () => {
    const spy = vi.spyOn(LiveAPI, "from").mockImplementation(() => {
      throw new Error("Live API not ready");
    });

    try {
      const restored = await syncProjectContextBackup("anything");

      expect(restored).toBeNull();
      expect(mockRequestNode).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("syncProjectContextBackup — failure", () => {
  it("returns null and does not memoize a failed sync (so it retries)", async () => {
    setFilePath(SAVED_PATH);
    mockRequestNode.mockResolvedValueOnce({ success: false, error: "boom" });

    const first = await syncProjectContextBackup("Genre: jungle");

    expect(first).toBeNull();

    // Same inputs: because the failure wasn't memoized, it retries.
    mockSyncResult("backup");
    await syncProjectContextBackup("Genre: jungle");

    expect(mockRequestNode).toHaveBeenCalledTimes(2);
  });
});

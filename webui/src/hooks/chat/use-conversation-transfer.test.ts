// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { renderHook, act } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useConversationTransfer } from "#webui/hooks/chat/use-conversation-transfer";
import {
  getConversationDb,
  saveConversation,
  resetDbCache,
  type ConversationRecord,
} from "#webui/lib/conversation-db";
import * as transferModule from "#webui/lib/conversation-transfer";

const refreshList = vi.fn().mockResolvedValue(undefined);

/**
 * Wait for multiple rounds of microtasks/macrotasks to settle.
 * @returns Promise that resolves after async operations complete
 */
async function waitForAsyncOps(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => {
      setTimeout(r, 0);
    });
  }
}

/**
 * Create a test conversation record.
 * @param id - Conversation ID
 * @returns A minimal conversation record
 */
function makeRecord(id: string): ConversationRecord {
  return {
    id,
    title: "Test",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bookmarked: false,
    provider: null,
    model: null,
    modelLabel: null,
    messages: [{ role: "user", content: "hi" }],
  };
}

/**
 * Set up mocks for download-triggering DOM APIs.
 * @returns Spy on the anchor element's click method
 */
function mockDownloadApis() {
  const clickSpy = vi.fn();

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- need original to create real elements
  const origCreate = document.createElement.bind(document);

  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = origCreate(tag);

    if (tag === "a") vi.spyOn(el, "click").mockImplementation(clickSpy);

    return el;
  });

  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  return clickSpy;
}

/**
 * Mock file input creation so click() triggers onchange with the given file.
 * @param file - The file to provide via the input
 * @returns A promise that resolves when onFileSelected completes
 */
function mockFileInput(file: File): { settled: Promise<void> } {
  let resolveSettled: () => void;
  const settled = new Promise<void>((r) => {
    resolveSettled = r;
  });

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- need original to create real elements
  const origCreate = document.createElement.bind(document);

  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = origCreate(tag);

    if (tag === "input") {
      Object.defineProperty(el, "files", { value: [file] });

      let handler: ((ev: Event) => void) | null = null;

      Object.defineProperty(el, "onchange", {
        set(fn: (ev: Event) => void) {
          handler = fn;
        },
        get() {
          return handler;
        },
      });

      vi.spyOn(el, "click").mockImplementation(() => {
        handler?.(new Event("change"));
        // Wait for async file read + DB operations to settle
        void waitForAsyncOps().then(() => resolveSettled());
      });
    }

    return el;
  });

  return { settled };
}

describe("useConversationTransfer", () => {
  beforeEach(async () => {
    resetDbCache();
    const db = await getConversationDb();

    await db.clear("conversations");
  });

  it("starts with null notification", () => {
    const { result } = renderHook(() => useConversationTransfer(refreshList));

    expect(result.current.notification).toBeNull();
  });

  it("exports conversations and triggers download", async () => {
    await saveConversation(makeRecord("test-1"));

    const clickSpy = mockDownloadApis();
    const { result } = renderHook(() => useConversationTransfer(refreshList));

    await act(async () => {
      await result.current.handleExport();
    });

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(result.current.notification).toStrictEqual({
      message: "Exported 1 conversation",
      type: "success",
    });
  });

  it("dismisses notification manually", async () => {
    await saveConversation(makeRecord("test-1"));
    mockDownloadApis();

    const { result } = renderHook(() => useConversationTransfer(refreshList));

    await act(async () => {
      await result.current.handleExport();
    });

    expect(result.current.notification).not.toBeNull();

    void act(() => {
      result.current.dismissNotification();
    });

    expect(result.current.notification).toBeNull();
  });

  it("shows error notification on export failure", async () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("blob failed");
    });

    const { result } = renderHook(() => useConversationTransfer(refreshList));

    await act(async () => {
      await result.current.handleExport();
    });

    expect(result.current.notification).toStrictEqual({
      message: "Export failed: blob failed",
      type: "error",
    });
  });

  it("imports conversations from file", async () => {
    const data = { version: 1, conversations: [makeRecord("imported-1")] };
    const file = new File([JSON.stringify(data)], "test.json");
    const { settled } = mockFileInput(file);

    const { result } = renderHook(() => useConversationTransfer(refreshList));

    await act(async () => {
      await result.current.handleImport();
      await settled;
    });

    expect(refreshList).toHaveBeenCalled();
    expect(result.current.notification?.type).toBe("success");
    expect(result.current.notification?.message).toContain("1");
  });

  it("shows error notification on import failure", async () => {
    const file = new File(["not json"], "bad.json");
    const { settled } = mockFileInput(file);

    const { result } = renderHook(() => useConversationTransfer(refreshList));

    await act(async () => {
      await result.current.handleImport();
      await settled;
    });

    expect(result.current.notification?.type).toBe("error");
    expect(result.current.notification?.message).toContain("Import failed");
  });

  it("exports plural message for multiple conversations", async () => {
    await saveConversation(makeRecord("test-1"));
    await saveConversation(makeRecord("test-2"));
    mockDownloadApis();

    const { result } = renderHook(() => useConversationTransfer(refreshList));

    await act(async () => {
      await result.current.handleExport();
    });

    expect(result.current.notification?.message).toBe(
      "Exported 2 conversations",
    );
  });

  it("clears previous timer when showing a new notification", async () => {
    await saveConversation(makeRecord("test-1"));
    mockDownloadApis();

    const { result } = renderHook(() => useConversationTransfer(refreshList));

    // First export sets a timer
    await act(async () => {
      await result.current.handleExport();
    });

    expect(result.current.notification).not.toBeNull();

    // Second export should clear the previous timer and set a new one
    await act(async () => {
      await result.current.handleExport();
    });

    expect(result.current.notification?.type).toBe("success");
  });

  it("import shows updated and skipped counts in detail", async () => {
    // Pre-save a record so it counts as "updated" on import
    const existing = makeRecord("existing-1");

    await saveConversation(existing);

    const data = {
      version: 1,
      conversations: [
        existing, // will be updated
        makeRecord("new-1"), // will be new
        { id: 123, messages: "invalid" }, // will be skipped (invalid)
      ],
    };
    const file = new File([JSON.stringify(data)], "test.json");
    const { settled } = mockFileInput(file);

    const { result } = renderHook(() => useConversationTransfer(refreshList));

    await act(async () => {
      await result.current.handleImport();
      await settled;
    });

    expect(result.current.notification?.type).toBe("success");
    expect(result.current.notification?.message).toContain("new");
    expect(result.current.notification?.message).toContain("updated");
    expect(result.current.notification?.message).toContain("skipped");
  });

  it("export shows unknown error for non-Error throws", async () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- testing non-Error throw handling
      throw "string error";
    });

    const { result } = renderHook(() => useConversationTransfer(refreshList));

    await act(async () => {
      await result.current.handleExport();
    });

    expect(result.current.notification?.message).toBe(
      "Export failed: unknown error",
    );
  });

  it("import shows unknown error for non-Error throws", async () => {
    vi.spyOn(transferModule, "importConversations").mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- testing non-Error throw handling
      throw "string error";
    });

    const file = new File(["{}"], "test.json");
    const { settled } = mockFileInput(file);

    const { result } = renderHook(() => useConversationTransfer(refreshList));

    await act(async () => {
      await result.current.handleImport();
      await settled;
    });

    expect(result.current.notification?.message).toBe(
      "Import failed: unknown error",
    );
  });
});

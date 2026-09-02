// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  backupProjectContextOnEdit,
  noteProjectContextLoaded,
  resetProjectContextSyncMemo,
  syncProjectContextBackup,
} from "../project-context-sync.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
}));

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const { requestNode } =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");
const mockRequestNode = vi.mocked(requestNode);

const { warn } = await import("#src/shared/max/v8-max-console.ts");
const mockWarn = vi.mocked(warn);

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
  action: "restore" | "backup" | "clear" | "none" | "failed" | "unreadable",
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
      isEdit: false,
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
      isEdit: false,
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
      isEdit: false,
    });
  });

  it("does not clear the sidecar while the wipe question is still open", async () => {
    setFilePath(SAVED_PATH);

    // Upgrade-wiped device: the param came up empty, the sidecar still holds the
    // user's notes, and nothing has ruled the wipe out. Typing into the box and
    // then emptying it again burns the restore without answering the question.
    mockSyncResult("none");
    await backupProjectContextOnEdit("X");
    await backupProjectContextOnEdit("");
    mockRequestNode.mockClear();

    // The first tool call must not turn that into a delete.
    const restored = await syncProjectContextBackup("");

    expect(restored).toBeNull();
    expect(mockRequestNode).not.toHaveBeenCalled();
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

// A filesystem refusal is a SUCCESSFUL round-trip carrying bad news, so it's
// memoized like any other: retrying won't fix a read-only folder, and the whole
// point is to say so once instead of on every tool call for the rest of the
// session. The user believing a broken backup is fine is the bug being fixed.
describe("syncProjectContextBackup — the filesystem refused", () => {
  it("warns that the backup didn't reach disk, and memoizes so it says so once", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("failed");

    await syncProjectContextBackup("Genre: jungle");

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("Could not save the project context backup"),
    );

    // Memoized: the same content doesn't round-trip or re-warn.
    await syncProjectContextBackup("Genre: jungle");

    expect(mockRequestNode).toHaveBeenCalledTimes(1);
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it("warns again when the context changes and it still won't save", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("failed");
    await syncProjectContextBackup("Genre: jungle");
    mockSyncResult("failed");

    await syncProjectContextBackup("Genre: techno");

    expect(mockWarn).toHaveBeenCalledTimes(2);
  });

  // A failed CLEAR fails the opposite way round: the sidecar survived, so the
  // next device load restores what the user just deleted. Different message.
  it("warns that a clear didn't stick when the delete failed", async () => {
    setFilePath(SAVED_PATH);
    // A completed first sync spends the restore and settles the wipe question,
    // so the empty param that follows reaches Node's clear path.
    mockSyncResult("backup");
    await syncProjectContextBackup("Genre: jungle");
    mockSyncResult("failed");

    await syncProjectContextBackup("");

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("Could not delete the project context backup"),
    );
  });
});

// The one refusal that is NOT memoized. A sidecar we couldn't read may still
// hold the notes a device (re)load blanked, so the session's restore isn't spent
// and the wipe question isn't settled — the read retries instead. The warning
// says so once, since it would otherwise land in every tool result.
describe("syncProjectContextBackup — the backup couldn't be read", () => {
  it("warns once and retries, so a lock that clears still restores", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("unreadable");

    expect(await syncProjectContextBackup("")).toBeNull();
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("Could not read the project context backup"),
    );

    // Not memoized: the same empty param round-trips again, and it still carries
    // allowRestore — the session's one restore wasn't spent on a failed read.
    mockSyncResult("restore", "Genre: jungle");

    expect(await syncProjectContextBackup("")).toBe("Genre: jungle");
    expect(mockRequestNode).toHaveBeenLastCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "",
      allowRestore: true,
      isEdit: false,
    });
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  // The retry is what makes the once matter: a permission problem never clears,
  // so without the memo every tool call for the rest of the session carries the
  // same warning.
  it("stays quiet on a retry that couldn't read it either", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("unreadable");
    await syncProjectContextBackup("");

    mockSyncResult("unreadable");

    expect(await syncProjectContextBackup("")).toBeNull();
    expect(mockRequestNode).toHaveBeenCalledTimes(2);
    expect(mockWarn).toHaveBeenCalledTimes(1);
  });

  it("leaves the wipe question open, so a later edit can't bury the backup", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("unreadable");
    await syncProjectContextBackup("");

    // The user types into the still-empty box. isEdit stays false: nothing has
    // managed to read the sidecar, so nothing may overwrite it.
    mockSyncResult("none");
    await backupProjectContextOnEdit("Genre: jungle");

    expect(mockRequestNode).toHaveBeenLastCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "Genre: jungle",
      allowRestore: false,
      isEdit: false,
    });
  });

  // A genuine write is the other half: the skip is right (the sidecar may hold
  // the folder's shared notes), but the user thinks their edit was backed up.
  it("tells the user when a genuine write was skipped, and retries it", async () => {
    setFilePath(SAVED_PATH);
    noteProjectContextLoaded("Genre: house");
    mockSyncResult("unreadable");

    await backupProjectContextOnEdit("Genre: jungle");

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("was left alone rather than risk burying notes"),
    );

    // Not memoized: an unreadable sidecar is usually a passing lock, so the next
    // sync tries again rather than forfeiting the backup for the session.
    mockSyncResult("backup");
    await backupProjectContextOnEdit("Genre: jungle");

    expect(mockRequestNode).toHaveBeenCalledTimes(2);
    expect(mockRequestNode).toHaveBeenLastCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "Genre: jungle",
      allowRestore: false,
      isEdit: true,
    });
  });

  // The same write with the wipe question still open. It travels with isEdit
  // false — it may not overwrite the sidecar yet — but it is still the user's own
  // text that didn't reach disk, and silence there hid every edit of a session
  // where the wipe latched "stuck".
  it("tells the user even when the skipped write couldn't claim write privileges", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("unreadable");

    await backupProjectContextOnEdit("Genre: jungle");

    expect(mockRequestNode).toHaveBeenCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "Genre: jungle",
      allowRestore: false,
      isEdit: false,
    });
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining("was left alone rather than risk burying notes"),
    );
  });

  // A passing sync only observes the param — it was never allowed to overwrite
  // an existing sidecar, so an unreadable one costs it nothing worth saying.
  it("says nothing when a passing sync couldn't read the sidecar", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("unreadable");

    expect(await syncProjectContextBackup("Genre: jungle")).toBeNull();
    expect(mockWarn).not.toHaveBeenCalled();

    // Memoized, so it doesn't round-trip again on every tool call.
    await syncProjectContextBackup("Genre: jungle");

    expect(mockRequestNode).toHaveBeenCalledTimes(1);
  });
});

describe("backupProjectContextOnEdit — manual edits", () => {
  it("backs up a non-empty edit made before any tool-call sync, without write privileges", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("backup");

    await backupProjectContextOnEdit("Genre: jungle");

    // A manual edit must never restore, even as the session's first sync. It
    // doesn't overwrite a differing sidecar yet either: the device may have
    // loaded upgrade-wiped, and this could be the first thing typed into an
    // empty box — burying notes nothing could then restore. A MISSING sidecar
    // is still created (Node's own guard).
    expect(mockRequestNode).toHaveBeenCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "Genre: jungle",
      allowRestore: false,
      isEdit: false,
    });
  });

  it("backs up an edit with write privileges once the wipe is ruled out", async () => {
    setFilePath(SAVED_PATH);
    // A load echo carrying content proves nothing wiped the device.
    noteProjectContextLoaded("Genre: house");
    mockSyncResult("backup");

    await backupProjectContextOnEdit("Genre: jungle");

    expect(mockRequestNode).toHaveBeenCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "Genre: jungle",
      allowRestore: false,
      isEdit: true,
    });
  });

  it("leaves an emptied param alone before any sync (may be an upgrade wipe)", async () => {
    setFilePath(SAVED_PATH);

    await backupProjectContextOnEdit("   ");

    // Deleting the sidecar here would destroy a backup the first sync restores.
    expect(mockRequestNode).not.toHaveBeenCalled();
  });

  it("leaves an emptied param alone when the load echo was blank too", async () => {
    setFilePath(SAVED_PATH);
    // A blank load echo is exactly what an upgrade wipe looks like, so it rules
    // nothing out and the guard above still applies.
    noteProjectContextLoaded("   ");

    await backupProjectContextOnEdit("");

    expect(mockRequestNode).not.toHaveBeenCalled();
  });

  it("clears the sidecar for an empty edit when the param loaded with content", async () => {
    setFilePath(SAVED_PATH);
    // The load echo carried content, so nothing wiped the device — clearing the
    // param is a user's deliberate clear, even before the first tool call.
    noteProjectContextLoaded("Genre: jungle");
    mockSyncResult("clear");

    await backupProjectContextOnEdit("");

    expect(mockRequestNode).toHaveBeenCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "",
      allowRestore: false,
      isEdit: true,
    });
  });

  it("clears the sidecar for an empty edit once a tool-call sync has ruled out the wipe", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("backup");
    await syncProjectContextBackup("Genre: jungle");

    mockSyncResult("clear");
    await backupProjectContextOnEdit("");

    expect(mockRequestNode).toHaveBeenLastCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "",
      allowRestore: false,
      isEdit: true,
    });
  });

  it("keeps every edit after the first guarded while the wipe is unresolved", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("backup");
    await backupProjectContextOnEdit("Genre: jungle");

    // The first edit's own sync must NOT count as ruling the wipe out: the user
    // is typing into what may be an upgrade-wiped param, and this second edit
    // would otherwise overwrite the sidecar holding their real notes.
    mockSyncResult("backup");
    await backupProjectContextOnEdit("Genre: jungle, dnb");

    expect(mockRequestNode).toHaveBeenLastCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "Genre: jungle, dnb",
      allowRestore: false,
      isEdit: false,
    });
  });

  it("stays guarded for the rest of the session once an edit lands unresolved", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("backup");
    await backupProjectContextOnEdit("Genre: jungle");

    // A later tool-call sync sees the user's own text, not what the device
    // loaded, so it can't answer the question either.
    mockSyncResult("none");
    await syncProjectContextBackup("Genre: jungle, dnb");

    mockSyncResult("backup");
    await backupProjectContextOnEdit("Genre: dnb");

    expect(mockRequestNode).toHaveBeenLastCalledWith("projectContext.sync", {
      filePath: SAVED_PATH,
      content: "Genre: dnb",
      allowRestore: false,
      isEdit: false,
    });
  });

  it("does not round-trip when the edited blob matches the last sync", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("backup");
    await backupProjectContextOnEdit("Genre: jungle");

    await backupProjectContextOnEdit("Genre: jungle");

    expect(mockRequestNode).toHaveBeenCalledTimes(1);
  });

  it("skips the round-trip and forgets the memo path when the set is unsaved", async () => {
    setFilePath(null);

    await backupProjectContextOnEdit("Genre: jungle");

    expect(mockRequestNode).not.toHaveBeenCalled();
  });

  it("does not memoize a failed edit backup (so the next edit retries)", async () => {
    setFilePath(SAVED_PATH);
    mockRequestNode.mockResolvedValueOnce({ success: false, error: "boom" });
    await backupProjectContextOnEdit("Genre: jungle");

    mockSyncResult("backup");
    await backupProjectContextOnEdit("Genre: jungle");

    expect(mockRequestNode).toHaveBeenCalledTimes(2);
  });

  it("shares the memo with the tool-call sync so a restore echo can't loop", async () => {
    setFilePath(SAVED_PATH);
    mockSyncResult("restore", "Restored from disk");
    await syncProjectContextBackup("");

    // The restore re-persists into the param, echoing back through the setter.
    await backupProjectContextOnEdit("Restored from disk");

    expect(mockRequestNode).toHaveBeenCalledTimes(1);
  });
});

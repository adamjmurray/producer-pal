// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Guards the one thing that separates a device load from a user edit. Max
// delivers the saved project-context blob back through the same projectContext()
// setter a real edit uses, so without this the blob saved in an older Set gets
// backed up over the Live Project folder's newer shared sidecar on load.

import { describe, expect, it, vi } from "vitest";

vi.mock(import("#src/live-api-adapter/project-context-sync.ts"), () => ({
  backupProjectContextOnEdit: vi.fn(),
  syncProjectContextBackup: vi.fn(),
  resetProjectContextSyncMemo: vi.fn(),
}));

const { backupProjectContextOnEdit } =
  await import("#src/live-api-adapter/project-context-sync.ts");
const mockBackup = vi.mocked(backupProjectContextOnEdit);

const { projectContext } =
  await import("#src/live-api-adapter/live-api-adapter.ts");

const SAVED_BLOB = "stale blob saved in an older Set";

// The latch and the last-seen blob are module-level state in live-api-adapter.ts
// with no reset seam (it is the Max entry point, not a service), so this walks
// one device lifecycle in a single test rather than leaking order dependencies
// between separate `it`s.
describe("projectContext() setter — load echo vs. genuine edit", () => {
  it("backs up genuine edits only, ignoring every load-time echo", () => {
    // Echo 1 — the session's FIRST setter call is always the saved blob coming
    // back: Live emits the textedit's embedded value when it restores the
    // device, and the ---v8-started / ---node-started bangs re-emit it. This is
    // the call that used to clobber the folder's sidecar.
    projectContext(SAVED_BLOB);

    expect(mockBackup).not.toHaveBeenCalled();

    // Echoes 2 and 3 — observed in a real Max load, arriving in no guaranteed
    // order relative to each other or to Node's startup. They all re-emit the
    // same textedit content, so a set that changes nothing is never an edit.
    projectContext(SAVED_BLOB);
    projectContext(SAVED_BLOB);

    expect(mockBackup).not.toHaveBeenCalled();

    // A real edit: the user types in the Context tab, or a webui POST /config
    // lands. This is the only shape that reaches the sidecar.
    projectContext("edited by the user");

    expect(mockBackup).toHaveBeenCalledExactlyOnceWith("edited by the user");

    // Max's textedit routes bang for the empty string, and clearing the context
    // is a real edit that must propagate (Node deletes the sidecar for it).
    projectContext("bang");

    expect(mockBackup).toHaveBeenLastCalledWith("");
  });
});

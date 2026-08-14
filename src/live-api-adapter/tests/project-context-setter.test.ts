// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Adapter-side project-context handling: the setter's device-load-vs-edit
// distinction, and applying a restore without losing a write that raced it.

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";

vi.mock(import("#src/live-api-adapter/project-context-sync.ts"), () => ({
  backupProjectContextOnEdit: vi.fn(),
  noteProjectContextLoaded: vi.fn(),
  syncProjectContextBackup: vi.fn(),
  resetProjectContextSyncMemo: vi.fn(),
}));

const { backupProjectContextOnEdit, noteProjectContextLoaded } =
  await import("#src/live-api-adapter/project-context-sync.ts");
const mockBackup = vi.mocked(backupProjectContextOnEdit);
const mockNoteLoaded = vi.mocked(noteProjectContextLoaded);

const { syncProjectContextBackup } =
  await import("#src/live-api-adapter/project-context-sync.ts");
const mockSync = vi.mocked(syncProjectContextBackup);

const { mcp_request, projectContext } =
  await import("#src/live-api-adapter/live-api-adapter.ts");

/** The outlet calls that re-persist a restored blob into the device param. */
const restoreOutlets = (): unknown[][] =>
  vi
    .mocked(outlet)
    .mock.calls.filter((call) => call[1] === "update_project_context");

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
    // …but it does tell the sync the param arrived holding content, which is
    // what lets a later clear delete the sidecar instead of being restored.
    expect(mockNoteLoaded).toHaveBeenCalledExactlyOnceWith(SAVED_BLOB);

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

// The sync runs before every tool call and can restore the sidecar into an
// empty param. That restore is applied AFTER an await, so a project-context
// write can land in between — routine now that a turn with subagents makes
// parallel tool calls.
describe("applying a restored blob around a concurrent write", () => {
  /**
   * Run one tool call with the backup sync held open, letting the caller act
   * while the restore is in flight.
   * @param restored - The blob the sync resolves with
   * @param duringSync - Runs while the sync is still pending
   */
  async function requestWithPendingSync(
    restored: string,
    duringSync: () => void,
  ): Promise<void> {
    let releaseSync!: (value: string) => void;

    mockSync.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        releaseSync = resolve;
      }),
    );

    // No such tool: callTool rejects and the error is reported to the caller.
    // The sync under test already ran by then, which is all this needs.
    const request = mcp_request("req-1", "ppal-not-a-tool", "{}");

    await Promise.resolve();
    duringSync();
    releaseSync(restored);
    await request;
  }

  it("keeps a write that landed while the restore was in flight", async () => {
    projectContext("the param as the device loaded it");
    vi.mocked(outlet).mockClear();

    await requestWithPendingSync("older notes from the sidecar", () => {
      // A ppal-context write from a parallel tool call. It is NEWER than the
      // blob the restore is carrying, so reverting it would lose the write
      // after the tool already reported success.
      projectContext("notes the model just wrote");
    });

    expect(restoreOutlets()).toStrictEqual([]);
  });

  it("applies the restore when nothing touched the param", async () => {
    projectContext("");
    vi.mocked(outlet).mockClear();

    await requestWithPendingSync("notes from the sidecar", () => {});

    expect(restoreOutlets()).toStrictEqual([
      [0, "update_project_context", "notes from the sidecar"],
    ]);
  });

  it("stays quiet when a concurrent restore already applied the same blob", async () => {
    projectContext("");
    vi.mocked(outlet).mockClear();

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Two session starts racing on the same sidecar. The second one's snapshot
    // no longer matches, but the param already holds exactly what it carries —
    // that is agreement, not the divergence the warning is for.
    await requestWithPendingSync("notes from the sidecar", () => {
      projectContext("notes from the sidecar");
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(restoreOutlets()).toStrictEqual([]);

    warnSpy.mockRestore();
  });
});

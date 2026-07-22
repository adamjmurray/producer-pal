// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MAX_CHUNK_SIZE } from "#src/shared/mcp-response-utils.ts";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";
import {
  executeNoteCodeWithData,
  handleCodeExecResult,
  requestCodeExecution,
} from "../code-exec-v8-protocol.ts";
import {
  installCapturingTask,
  installTrackingTask,
  latestOutletPayload,
  latestOutletRequestId,
} from "./v8-protocol-test-helpers.ts";

// No v8-max-console mock needed: importing it is side-effect-free and the
// request-size guard path never logs. (Avoiding the standard mock block also
// keeps this file from adding an irreducible vi.mock-boilerplate test clone.)

/**
 * Get the requestId from the most recent code_exec_request outlet call.
 *
 * @returns The requestId argument
 */
function latestRequestId(): string {
  return latestOutletRequestId("code_exec_request");
}

describe("code-exec-v8-protocol requestCodeExecution", () => {
  it("resolves a loud error without sending a request too large for one IPC message", async () => {
    // M6: the request (code + the clip's notes) is sent as one unchunked IPC
    // string, which Max silently truncates past its ~32k limit. A large clip
    // must fail loudly here instead of emitting a corrupt request.
    const outletMock = vi.mocked(globalThis.outlet);

    outletMock.mockClear();

    // Enough notes that JSON.stringify({ code, globals }) exceeds MAX_CHUNK_SIZE.
    const noteCount = Math.ceil(MAX_CHUNK_SIZE / 10) + 100;
    const notes = Array.from({ length: noteCount }, (_, i) => ({
      pitch: 60,
      start: i,
    }));

    const result = await requestCodeExecution("return notes", { notes });

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain("too large");
    // The oversized request must NOT have been emitted to Node.
    expect(outletMock).not.toHaveBeenCalledWith(
      0,
      "code_exec_request",
      expect.anything(),
      expect.anything(),
    );
  });

  it("emits the request when it fits in one IPC message", async () => {
    const outletMock = vi.mocked(globalThis.outlet);

    outletMock.mockClear();

    // Fire-and-don't-await: the result Promise only settles on a Node reply (or
    // timeout); we only care that a small request IS emitted.
    void requestCodeExecution("return notes", {
      notes: [{ pitch: 60, start: 0 }],
    });

    expect(outletMock).toHaveBeenCalledWith(
      0,
      "code_exec_request",
      expect.any(String),
      expect.any(String),
    );
  });

  it("emits the code and globals as the request payload", () => {
    void requestCodeExecution("return notes", { notes: [{ pitch: 60 }] });

    expect(latestOutletPayload("code_exec_request")).toStrictEqual({
      code: "return notes",
      globals: { notes: [{ pitch: 60 }] },
    });
  });

  it("defaults globals to an empty object", () => {
    void requestCodeExecution("return 1");

    expect(
      latestOutletPayload<{ globals: unknown }>("code_exec_request").globals,
    ).toStrictEqual({});
  });

  // Uniqueness alone is also satisfied by a counter running the wrong way, so
  // pin the prefix and the direction. The counter is module state shared with
  // every other test here, hence the relative assertion.
  it("generates request IDs that count up from the code-exec- prefix", () => {
    void requestCodeExecution("a");
    const id1 = latestRequestId();

    void requestCodeExecution("b");
    const id2 = latestRequestId();

    expect(id1).toMatch(/^code-exec-\d+$/);
    expect(Number(id2.slice("code-exec-".length))).toBe(
      Number(id1.slice("code-exec-".length)) + 1,
    );
  });

  it("names the oversized request in the error it resolves", async () => {
    const result = await requestCodeExecution("return notes", {
      notes: "x".repeat(MAX_CHUNK_SIZE),
    });

    expect((result as { error: string }).error).toContain("code-exec request");
  });

  it("arms a timeout task for the pending request", () => {
    const scheduleCalls: number[] = [];
    const restore = installTrackingTask(scheduleCalls);

    try {
      void requestCodeExecution("return notes");

      expect(scheduleCalls).toStrictEqual([10_000]);
    } finally {
      restore();
    }
  });
});

describe("code-exec-v8-protocol handleCodeExecResult", () => {
  it("resolves the pending request with the parsed Node result", async () => {
    const promise = requestCodeExecution("return notes");

    handleCodeExecResult(
      latestRequestId(),
      JSON.stringify({ success: true, result: [{ pitch: 62 }] }),
    );

    await expect(promise).resolves.toStrictEqual({
      success: true,
      result: [{ pitch: 62 }],
    });
  });

  it("resolves with a parse error when Node sends malformed JSON", async () => {
    const promise = requestCodeExecution("return notes");

    handleCodeExecResult(latestRequestId(), "not json {");

    const result = await promise;

    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toContain(
      "Failed to parse code_exec_result:",
    );
  });

  it("cancels the timeout task once the result arrives", () => {
    const scheduleCalls: number[] = [];
    const restore = installTrackingTask(scheduleCalls);

    try {
      void requestCodeExecution("return notes");
      handleCodeExecResult(
        latestRequestId(),
        JSON.stringify({ success: true, result: [] }),
      );

      // -1 is how a Max Task is cancelled.
      expect(scheduleCalls).toStrictEqual([10_000, -1]);
    } finally {
      restore();
    }
  });

  it("ignores a result for an unknown request", () => {
    expect(() =>
      handleCodeExecResult("code-exec-does-not-exist", "{}"),
    ).not.toThrow();
  });

  it("ignores a second result for the same request", async () => {
    const promise = requestCodeExecution("return notes");
    const requestId = latestRequestId();

    handleCodeExecResult(
      requestId,
      JSON.stringify({ success: true, result: [{ pitch: 60 }] }),
    );
    // A late duplicate must not throw on the already-deleted pending entry.
    expect(() =>
      handleCodeExecResult(
        requestId,
        JSON.stringify({ success: true, result: [{ pitch: 99 }] }),
      ),
    ).not.toThrow();

    await expect(promise).resolves.toStrictEqual({
      success: true,
      result: [{ pitch: 60 }],
    });
  });
});

describe("code-exec-v8-protocol timeout", () => {
  it("resolves with a timeout error when Node never replies", async () => {
    const captured: Array<() => void> = [];
    const restore = installCapturingTask(captured);

    try {
      const promise = requestCodeExecution("return notes");

      captured.at(-1)?.();

      await expect(promise).resolves.toStrictEqual({
        success: false,
        error: "Code execution timed out after 10000ms",
      });
    } finally {
      restore();
    }
  });

  it("does not resolve twice when a result arrives before the timeout fires", async () => {
    const captured: Array<() => void> = [];
    const restore = installCapturingTask(captured);

    try {
      const promise = requestCodeExecution("return notes");
      const requestId = latestRequestId();

      handleCodeExecResult(
        requestId,
        JSON.stringify({ success: true, result: [] }),
      );
      // The task callback still fires if cancellation was a no-op; the pending
      // entry is gone, so it must leave the settled result alone.
      captured.at(-1)?.();

      await expect(promise).resolves.toStrictEqual({
        success: true,
        result: [],
      });
    } finally {
      restore();
    }
  });
});

describe("code-exec-v8-protocol executeNoteCodeWithData", () => {
  const CONTEXT = {
    view: "session",
    trackIndex: 0,
    clipIndex: 0,
    clipCount: 1,
  } as unknown as Parameters<typeof executeNoteCodeWithData>[2];

  it("wraps the user code in a function receiving notes and context", () => {
    void executeNoteCodeWithData(
      "return notes;",
      [{ pitch: 60 } as never],
      CONTEXT,
    );

    expect(
      latestOutletPayload<{ code: string }>("code_exec_request").code,
    ).toBe("(function(notes, context) { return notes; })(notes, context)");
  });

  it("passes the notes and context through as globals", () => {
    void executeNoteCodeWithData(
      "return notes;",
      [{ pitch: 60 } as never],
      CONTEXT,
    );

    expect(
      latestOutletPayload<{ globals: unknown }>("code_exec_request").globals,
    ).toStrictEqual({ notes: [{ pitch: 60 }], context: CONTEXT });
  });

  it("returns a sandbox failure unchanged, without validating notes", async () => {
    const promise = executeNoteCodeWithData("boom", [], CONTEXT);

    handleCodeExecResult(
      latestRequestId(),
      JSON.stringify({ success: false, error: "ReferenceError: boom" }),
    );

    await expect(promise).resolves.toStrictEqual({
      success: false,
      error: "ReferenceError: boom",
    });
  });

  it("validates the notes the sandbox returned on success", async () => {
    const promise = executeNoteCodeWithData("return notes;", [], CONTEXT);

    handleCodeExecResult(
      latestRequestId(),
      // Deliberately under-specified notes: only the validator fills in the
      // defaults below, so asserting them proves the raw sandbox result was
      // not passed straight through.
      JSON.stringify({ success: true, result: [{ pitch: 62, start: 0 }] }),
    );

    await expect(promise).resolves.toStrictEqual({
      success: true,
      notes: [
        {
          pitch: 62,
          start: 0,
          duration: 1,
          velocity: 100,
          probability: 1,
          velocityDeviation: 0,
        },
      ],
    });
  });
});

// This module is deliberately excluded from the coverage THRESHOLD: its core is
// V8↔Node round-trip glue driven by Max globals (LiveAPI / Task / outlet), not
// unit-coverable to 100% without reconstructing the async round-trip. The
// exclusion comment in vitest.config.ts says so — and says the pure paths still
// carry the unit tests above. Lock both halves of that claim here so the
// exclusion can't quietly rot into a lie (a coverage-excluded file that is in
// fact untested, or an exclude entry that names a file that has since moved).
//
// Read the config as TEXT, not via import: importing vitest.config.ts would
// pull it into the src typecheck graph (it isn't today), a far larger change
// than this guard warrants.
describe("coverage exclusion honesty", () => {
  const configText = readFileSync(
    join(projectRoot, "vitest.config.ts"),
    "utf8",
  );

  it("keeps this module in the vitest coverage exclude list", () => {
    expect(configText).toContain(
      '"src/live-api-adapter/code-exec-v8-protocol.ts"',
    );
  });

  it("names only files that exist in the config (no stale, dead paths)", () => {
    // Every concrete project-file path the config quotes — exclude entries,
    // setupFiles, alias targets — must still point at a real file. A renamed
    // file leaves a silently-dead reference (e.g. a coverage exclude that then
    // matches nothing, so the file rejoins the threshold unnoticed) — the same
    // silent dangling-reference class this guards against.
    const quoted = [...configText.matchAll(/"([^"]+)"/g)].map(
      (m) => m[1] ?? "",
    );
    const concreteFiles = quoted.filter(
      (entry) =>
        /^(src|webui|evals|scripts)\//.test(entry) &&
        !/[*?[\]{}]/.test(entry) &&
        /\.[a-z]+$/.test(entry),
    );

    expect(concreteFiles.length).toBeGreaterThan(0); // guard against a vacuous pass

    const missing = concreteFiles.filter(
      (entry) => !existsSync(join(projectRoot, entry)),
    );

    expect(missing).toStrictEqual([]);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MAX_CHUNK_SIZE } from "#src/shared/mcp-response-utils.ts";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";
import { requestCodeExecution } from "../code-exec-v8-protocol.ts";

// No v8-max-console mock needed: importing it is side-effect-free and the
// request-size guard path never logs. (Avoiding the standard mock block also
// keeps this file from adding an irreducible vi.mock-boilerplate test clone.)

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
    // matches nothing, so the file rejoins the threshold unnoticed). Same
    // dangling-reference class as the smallModelModeConfig param guard.
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

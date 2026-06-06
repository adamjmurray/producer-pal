// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { MAX_CHUNK_SIZE } from "#src/shared/mcp-response-utils.ts";
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

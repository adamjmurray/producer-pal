// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A response says `changedNothing` only when every write in the request was
// proven to change nothing. Node leaves Live's undo step open on it.

import { describe, expect, it, vi } from "vitest";
import { reassembleChunks } from "#src/shared/mcp-responses.ts";
import { recordWriteRun } from "#src/shared/max/v8-warning-capture.ts";

vi.mock(import("#src/live-api-adapter/project-context-sync.ts"), () => ({
  backupProjectContextOnEdit: vi.fn(),
  noteProjectContextLoaded: vi.fn(),
  syncProjectContextBackup: vi.fn(),
  resetProjectContextSyncMemo: vi.fn(),
}));

vi.mock(import("#src/tools/clip/create/create-clip.ts"), () => ({
  createClip: vi.fn(),
}));

vi.mock(import("#src/tools/track/read/read-track.ts"), () => ({
  readTrack: vi.fn(),
}));

const { createClip } = await import("#src/tools/clip/create/create-clip.ts");
const { readTrack } = await import("#src/tools/track/read/read-track.ts");
const { mcp_request } =
  await import("#src/live-api-adapter/live-api-adapter.ts");

/**
 * The payload a request sent back out outlet 0.
 * @param requestId - The request
 * @returns The parsed payload
 */
function responseFor(requestId: string): {
  isError?: boolean;
  changedNothing?: boolean;
} {
  const call = vi
    .mocked(outlet)
    .mock.calls.find(
      (args) => args[1] === "mcp_response" && args[2] === requestId,
    );

  return JSON.parse(reassembleChunks(call?.slice(3) ?? [])) as object;
}

describe("changedNothing sidecar", () => {
  it("rides a response whose writes were all proven to change nothing", async () => {
    vi.mocked(createClip).mockImplementation(() => {
      recordWriteRun(true);

      return Promise.resolve({});
    });
    await mcp_request("req-noop", "ppal-create-clip", "{}");

    expect(responseFor("req-noop").changedNothing).toBe(true);
  });

  it("rides an error response too", async () => {
    vi.mocked(createClip).mockImplementation(() => {
      recordWriteRun(true);

      return Promise.reject(new Error("refused"));
    });
    await mcp_request("req-refused", "ppal-create-clip", "{}");

    expect(responseFor("req-refused")).toStrictEqual(
      expect.objectContaining({ isError: true, changedNothing: true }),
    );
  });

  it("is left off when a write may have changed something", async () => {
    vi.mocked(createClip).mockImplementation(() => {
      recordWriteRun(true);
      recordWriteRun(false);

      return Promise.resolve({});
    });
    await mcp_request("req-changed", "ppal-create-clip", "{}");

    expect(responseFor("req-changed")).not.toHaveProperty("changedNothing");
  });

  it("is left off when no write ran", async () => {
    vi.mocked(readTrack).mockReturnValue({});
    await mcp_request("req-read", "ppal-read-track", "{}");

    expect(responseFor("req-read")).not.toHaveProperty("changedNothing");
  });

  it("is not carried to the next request", async () => {
    vi.mocked(createClip).mockImplementation(() => {
      recordWriteRun(true);

      return Promise.resolve({});
    });
    vi.mocked(readTrack).mockReturnValue({});
    await mcp_request("req-first", "ppal-create-clip", "{}");
    await mcp_request("req-second", "ppal-read-track", "{}");

    expect(responseFor("req-second")).not.toHaveProperty("changedNothing");
  });
});

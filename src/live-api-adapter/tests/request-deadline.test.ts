// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The request's deadline is computed here, once, and every tool reads it off the
// context. Computing it at tool entry instead would hand a nested call (duplicate
// -> updateClip) a fresh full budget, so N of them could overrun the Node-side
// timeout together and lose the whole response to it.

import { describe, expect, it, vi } from "vitest";
import { LOOP_DEADLINE_BUFFER_MS } from "#src/tools/clip/helpers/loop-deadline.ts";

vi.mock(import("#src/live-api-adapter/project-context-sync.ts"), () => ({
  backupProjectContextOnEdit: vi.fn(),
  noteProjectContextLoaded: vi.fn(),
  syncProjectContextBackup: vi.fn(),
  resetProjectContextSyncMemo: vi.fn(),
}));

vi.mock(import("#src/tools/clip/create/create-clip.ts"), () => ({
  createClip: vi.fn(() => Promise.resolve({ id: "clip" })),
}));

const { createClip } = await import("#src/tools/clip/create/create-clip.ts");
const { mcp_request } =
  await import("#src/live-api-adapter/live-api-adapter.ts");

/**
 * Run a tool call and return the context the adapter built for it.
 *
 * @param context - The context fields Node sent with the request
 * @returns The deadline the tool received
 */
async function deadlineFor(
  context: Record<string, unknown>,
): Promise<number | null | undefined> {
  vi.mocked(createClip).mockClear();

  await mcp_request("req-1", "ppal-create-clip", "{}", JSON.stringify(context));

  return vi.mocked(createClip).mock.calls[0]?.[1]?.deadline;
}

describe("request deadline", () => {
  it("is the request timeout minus the safety buffer", async () => {
    const before = Date.now();
    const deadline = await deadlineFor({ timeoutMs: 30_000 });
    const after = Date.now();

    expect(deadline).toBeGreaterThanOrEqual(
      before + 30_000 - LOOP_DEADLINE_BUFFER_MS,
    );
    expect(deadline).toBeLessThanOrEqual(
      after + 30_000 - LOOP_DEADLINE_BUFFER_MS,
    );
  });

  it("is null when the request carries no timeout", async () => {
    expect(await deadlineFor({})).toBeNull();
  });
});

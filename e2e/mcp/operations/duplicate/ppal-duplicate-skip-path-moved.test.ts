// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E test for a skipped `ppal-duplicate` source whose path an earlier copy in
 * the same call moved. A copy of a track lands beside its source, so a later
 * source path that named nothing when the call began names the new copy by the
 * end; the skip keeps the caller's path and says so.
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-skip-path-moved
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";

const ctx = setupMcpTestContext();

interface Entry {
  id?: string;
  path?: string;
  ok?: false;
  detail?: string;
}

describe("ppal-duplicate skip whose source path an earlier copy moved", () => {
  it("says a source path that named no track now names one", async () => {
    // The new track is the last one, so the path after it is empty until the
    // copy of the track lands there.
    const last = await createMidiTrack(ctx.client!);
    const past = `t${last + 1}`;

    const entries = parseToolResult<Entry[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "track", path: `t${last},${past}` },
      }),
    );

    await sleep(150);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toStrictEqual(expect.objectContaining({ path: past }));
    expect(entries[1]).toStrictEqual({
      path: past,
      ok: false,
      detail: expect.stringMatching(/; nothing was there when the call began$/),
    });
  });

  it("adds nothing when the source path names nothing still", async () => {
    const last = await createMidiTrack(ctx.client!);
    const farPast = `t${last + 5}`;

    const entries = parseToolResult<Entry[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "track", path: `t${last},${farPast}` },
      }),
    );

    await sleep(150);

    expect(entries[1]).toStrictEqual({
      path: farPast,
      ok: false,
      detail: expect.not.stringContaining("when the call began"),
    });
  });
});

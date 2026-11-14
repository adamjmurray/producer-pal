// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-delete naming the clips that go with a track: session,
 * arrangement and take-lane clips, each by the path it had before the call.
 * Uses: e2e-test-set, where t8 is an empty MIDI track. Every test reopens the
 * Set, so the track a test deletes is back for the next.
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/track/delete/ppal-delete-track-clips.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

interface DeleteResult {
  id?: string;
  deletedPath?: string;
  detail?: string;
}

describe("ppal-delete of a track with clips", () => {
  /**
   * Make a clip, expecting it to land, and let Live settle.
   * @param args - ppal-create-clip arguments
   */
  async function makeClip(args: Record<string, unknown>): Promise<void> {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: args,
    });

    expect(isToolError(result)).toBe(false);
    await sleep(100);
  }

  /**
   * Delete a track by path.
   * @param path - The track's path
   * @returns The delete entry
   */
  async function deleteTrack(path: string): Promise<DeleteResult> {
    return parseToolResult<DeleteResult>(
      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { type: "track", path },
      }),
    );
  }

  it("names the session, arrangement and take-lane clips that went with it", async () => {
    const track = `t${EMPTY_MIDI_TRACK}`;

    // Made out of order, so the list order is the rule, not creation order.
    await makeClip({
      path: `${track}/l1[1|1]`,
      notes: "E3 1|1",
      name: "Take",
    });
    await makeClip({ path: `${track}[9|1]`, notes: "G3 1|1", name: "Fill" });
    await makeClip({ path: `${track}/s0`, name: "Bass" });
    await makeClip({ path: `${track}/s2` });

    const deleted = await deleteTrack(track);

    expect(deleted).toStrictEqual({
      id: expect.any(String),
      deletedPath: track,
      detail: `also deleted the 4 clips on this track: ${track}/s0 "Bass", ${track}/s2, ${track}[9|1] "Fill", ${track}/l1[1|1] "Take"`,
    });
  });

  it("names a lone clip in the singular", async () => {
    const track = `t${EMPTY_MIDI_TRACK}`;

    await makeClip({ path: `${track}/s0`, name: "Bass" });

    expect(await deleteTrack(track)).toStrictEqual({
      id: expect.any(String),
      deletedPath: track,
      detail: `also deleted the clip on this track: ${track}/s0 "Bass"`,
    });
  });

  it("leaves an empty track's entry plain", async () => {
    expect(await deleteTrack(`t${EMPTY_MIDI_TRACK}`)).toStrictEqual({
      id: expect.any(String),
      deletedPath: `t${EMPTY_MIDI_TRACK}`,
    });
  });
});

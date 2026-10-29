// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the longest arrangementLength Producer Pal takes (394200 bars
 * in 4/4). A longer one is refused before anything changes: it otherwise runs
 * to the deadline, stamping automation and clips along the way. The limit is
 * Producer Pal's, not Live's, and ignores where the clip starts: a short length
 * that ends past the last start position Live allows is accepted.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track)
 *
 * Covers ppal-update-clip too: it shares the check, and the folders for
 * update-clip e2e tests are full.
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-arrangement-length-cap
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import { arrangementStartOf } from "../../clip/helpers/arrangement-start-test-helpers.ts";
import {
  callTool,
  readArrangementClips,
} from "../../clip/helpers/arrangement-clip-query-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

const TRACK = `t${EMPTY_MIDI_TRACK}`;
const TOO_LONG = "arrangementLength can be at most 394200bar";

describe("arrangementLength over the longest Producer Pal takes", () => {
  let sessionClipId: string;
  let arrangementClipId: string;

  beforeAll(async () => {
    const session = await callTool(ctx.client!, "ppal-create-clip", {
      path: `${TRACK}/s0`,
      notes: "C3 1|1",
      length: "1bar",
      looping: true,
    });

    sessionClipId = parseToolResult<CreateClipResult>(session).id;

    const arrangement = await callTool(ctx.client!, "ppal-create-clip", {
      path: `${TRACK}[1|1]`,
      notes: "C3 1|1",
      length: "1bar",
    });

    arrangementClipId = parseToolResult<CreateClipResult>(arrangement).id;
    await sleep(150);
  });

  /**
   * Assert the call was refused with the limit's message and made nothing.
   * @param result - The raw tool result
   */
  async function expectRefusedWithNoCopies(result: unknown): Promise<void> {
    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(TOO_LONG);

    await sleep(100);

    // Only the one clip made in beforeAll.
    expect(
      await readArrangementClips(ctx.client!, EMPTY_MIDI_TRACK),
    ).toHaveLength(1);
  }

  it("refuses a duplicate whose length is too long alone", async () => {
    await expectRefusedWithNoCopies(
      await callTool(ctx.client!, "ppal-duplicate", {
        type: "clip",
        id: sessionClipId,
        toPath: `${TRACK}[9|1]`,
        arrangementLength: "500000bar",
      }),
    );
  });

  it("refuses the whole list when only one duplicate is too long", async () => {
    await expectRefusedWithNoCopies(
      await callTool(ctx.client!, "ppal-duplicate", {
        type: "clip",
        id: sessionClipId,
        toPath: `${TRACK}[9|1],${TRACK}[17|1]`,
        arrangementLength: "1bar,500000bar",
      }),
    );
  });

  it("refuses a scene copy whose length is too long", async () => {
    await expectRefusedWithNoCopies(
      await callTool(ctx.client!, "ppal-duplicate", {
        type: "scene",
        path: "s0",
        arrangementStart: "9|1",
        arrangementLength: "500000bar",
      }),
    );
  });

  it("refuses an update-clip length that is too long alone", async () => {
    await expectRefusedWithNoCopies(
      await callTool(ctx.client!, "ppal-update-clip", {
        id: arrangementClipId,
        arrangementLength: "500000bar",
      }),
    );
  });

  // Last: it adds a clip, which the refusals above count on not being there.
  it("accepts a long copy that ends past the last start position", async () => {
    const result = await callTool(ctx.client!, "ppal-duplicate", {
      type: "clip",
      id: sessionClipId,
      toPath: `${TRACK}[394200|1]`,
      arrangementLength: "2bar",
    });

    expect(isToolError(result)).toBe(false);

    // The 1-bar source tiles; the second tile starts on the last start
    // position and ends past it.
    const { clips: tiles } = parseToolResult<{ clips: { path: string }[] }>(
      result,
    );

    expect(tiles.map(({ path }) => path)).toStrictEqual([
      `${TRACK}[394200|1]`,
      `${TRACK}[394201|1]`,
    ]);

    await sleep(150);

    const clips = await readArrangementClips(ctx.client!, EMPTY_MIDI_TRACK);

    expect(clips.map(arrangementStartOf)).toStrictEqual(
      expect.arrayContaining(["394200|1", "394201|1"]),
    );
  });
});

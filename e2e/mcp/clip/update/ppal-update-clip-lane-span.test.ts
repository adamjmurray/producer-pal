// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for the length a looping clip keeps when a move re-creates it.
 *
 * A move onto or off a take lane rebuilds the clip. A clip whose loop is shorter
 * than the stretch of arrangement it covers (a 3-bar loop shown for 4 bars) must
 * keep the 4 bars, not shrink to the loop.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track, t7 = MIDI track with no clips)
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-lane-span
 */
import { describe, expect, it } from "vitest";
import {
  type ReadClipResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  createArrangementClip,
  readClipFully,
  updateClip,
} from "../helpers/clip-io-test-helpers.ts";
import { CHILD_TRACK, EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

describe("a looping clip re-created on or off a take lane", () => {
  it("keeps its arrangement length, loop and markers both ways", async () => {
    await setConfig({ liveApiEnabled: true });
    await sleep(50);

    // Made 4 bars long, then given a 3-bar loop (bars 2 to 4 of the clip).
    const source = await createArrangementClip(
      ctx.client!,
      EMPTY_MIDI_TRACK,
      "1|1",
      { name: "Short Loop", length: "4bar" },
    );

    await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: `id ${source.id}`,
        operations: [
          { type: "set", property: "loop_start", value: 4 },
          { type: "set", property: "start_marker", value: 4 },
        ],
      },
    });
    await sleep(100);

    const before = await readClipFully(ctx.client!, { id: source.id });

    // The setup itself: a 4-bar clip whose loop is shorter.
    expect(before.arrangementLength).toBe("4bar");
    expect(before.looping).toBe(true);
    expect(before.length).not.toBe("4bar");

    const { data: onLane } = await updateClip(ctx.client!, source.id, {
      toPath: `t${CHILD_TRACK}/l0[1|1]`,
    });

    expect(onLane.detail).toContain("re-created on");
    expect(onLane.detail).not.toContain("length is");

    const laneClip = await readClipFully(ctx.client!, { id: onLane.id });

    expect(laneClip.arrangementLength).toBe("4bar");
    expect(laneClip.length).toBe(before.length);
    expect(laneClip.start).toBe(before.start);
    expect(laneClip.end).toBe(before.end);

    const { data: back } = await updateClip(ctx.client!, onLane.id, {
      toPath: `t${CHILD_TRACK}[9|1]`,
    });

    expect(back.detail).toContain("re-created on");
    expect(back.detail).not.toContain("length is");

    const mainClip = await readClipFully(ctx.client!, { id: back.id });

    expect(mainClip.arrangementLength).toBe("4bar");
    expect(mainClip.length).toBe(before.length);
    expect(mainClip.start).toBe(before.start);
    expect(mainClip.end).toBe(before.end);
  });

  // The loop (4 bars) is longer than what the clip shows (2 bars).
  it("keeps a clip shown shorter than its loop", async () => {
    const source = await createArrangementClip(
      ctx.client!,
      EMPTY_MIDI_TRACK,
      "17|1",
      { name: "Cut Short", length: "4bar" },
    );

    await updateClip(ctx.client!, source.id, { arrangementLength: "2bar" });

    const before = await readClipFully(ctx.client!, { id: source.id });

    expect(before.arrangementLength).toBe("2bar");
    expect(before.looping).toBe(true);

    const { data: onLane } = await updateClip(ctx.client!, source.id, {
      toPath: `t${CHILD_TRACK}/l0[17|1]`,
    });
    const laneClip = await readClipFully(ctx.client!, { id: onLane.id });

    expectSpanKept(onLane.detail, laneClip, before);

    const { data: back } = await updateClip(ctx.client!, onLane.id, {
      toPath: `t${CHILD_TRACK}[25|1]`,
    });
    const mainClip = await readClipFully(ctx.client!, { id: back.id });

    expectSpanKept(back.detail, mainClip, before);
  });
});

/**
 * Check a re-created clip is the length, loop and start/end it was. If Live
 * can't keep the length, the entry's detail must say so.
 * @param detail - The move's entry detail
 * @param clip - The clip as read back after the move
 * @param before - The clip as read before the move
 */
function expectSpanKept(
  detail: string | undefined,
  clip: ReadClipResult,
  before: ReadClipResult,
): void {
  if (clip.arrangementLength === before.arrangementLength) {
    expect(detail).not.toContain("length is");
  } else {
    expect(detail).toContain("length is");
  }

  expect(clip.length).toBe(before.length);
  expect(clip.start).toBe(before.start);
  expect(clip.end).toBe(before.end);
}

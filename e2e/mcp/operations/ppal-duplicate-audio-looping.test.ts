// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for duplicating a looping audio clip to the arrangement with an
 * arrangementLength.
 *
 * t4/s0 loops and starts playback inside its loop (firstStart 1|2, loop from
 * 1|1.375). Live's copy still spans a whole loop — it plays to loop_end, wraps
 * to loop_start and plays out the rest — so filling a longer span must repeat
 * whole loops. Measuring the copy from its start marker instead made every tile
 * a fraction of a loop.
 *
 * Uses: e2e-test-set - t4 "Audio 1" (looping warped clip in s0), s0 "Intro"
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-audio-looping
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
  type ReadClipResult,
} from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext();

/** t4 "Audio 1": its s0 clip loops and starts inside its own loop. */
const WARPED_AUDIO_TRACK = 4;

/** Clear of t4's own arrangement clip at 17|1. */
const TARGET_BAR = 49;

/** What a duplicate says about one copy. */
interface ClipEntry {
  path?: string;
  reason?: string;
}

/** t4/s0's loop, as read-clip spells a duration. */
const LOOP = "n1.5888/4";

/**
 * Duplicate to the arrangement and read back the copies it left on t4.
 * @param args - ppal-duplicate arguments
 * @returns The call's clip entries, and t4's arrangement clips minus the one
 *   the Set ships at 17|1
 */
async function duplicateAndReadCopies(
  args: Record<string, unknown>,
): Promise<{ copies: ReadClipResult[]; entries: ClipEntry[] }> {
  const raw = await ctx.client!.callTool({
    name: "ppal-duplicate",
    arguments: args,
  });
  const { data, warnings } = parseToolResultWithWarnings<
    ClipEntry | { clips: ClipEntry[] }
  >(raw);

  // Whatever a copy could not do, its entry says; the call warns about nothing.
  expect(warnings).toStrictEqual([]);

  await sleep(150);

  const read = await ctx.client!.callTool({
    name: "ppal-read-track",
    arguments: {
      path: `t${WARPED_AUDIO_TRACK}`,
      include: ["arrangement-clips", "timing"],
    },
  });
  const track = parseToolResult<{ arrangementClips?: ReadClipResult[] }>(read);

  const copies = (track.arrangementClips ?? []).filter(
    (clip) => !clip.path?.startsWith(`t${WARPED_AUDIO_TRACK}[17|`),
  );

  return { copies, entries: "clips" in data ? data.clips : [data] };
}

/**
 * Assert every copy repeats the whole loop, with a remainder tile closing the
 * requested span.
 * @param copies - The clips the duplicate created
 * @param wholeLoops - How many whole loops fit in the span
 * @param remainder - The trailing tile's length
 */
function expectWholeLoopTiles(
  copies: ReadClipResult[],
  wholeLoops: number,
  remainder: string,
): void {
  expect(copies.map((clip) => clip.arrangementLength)).toStrictEqual([
    ...Array<string>(wholeLoops).fill(LOOP),
    remainder,
  ]);

  // Each copy keeps the source's loop brace and its start inside that loop, so
  // the repeats run on seamlessly from the first pass.
  for (const clip of copies) {
    expect(clip).toStrictEqual(
      expect.objectContaining({
        looping: true,
        length: LOOP,
        start: "1|1.375",
        firstStart: "1|2",
      }),
    );
  }
}

describe("ppal-duplicate with a looping audio source", () => {
  it("repeats whole loops when a clip duplicate fills an arrangementLength", async () => {
    // 2 bars holds 5 whole loops and 0.0562 beats over.
    const { copies } = await duplicateAndReadCopies({
      type: "clip",
      path: `t${WARPED_AUDIO_TRACK}/s0`,
      toPath: `t${WARPED_AUDIO_TRACK}[${TARGET_BAR}|1]`,
      arrangementLength: "2bar",
    });

    expectWholeLoopTiles(copies, 5, "n0.0562/4");
  });

  it("repeats whole loops when a scene duplicate fills an arrangementLength", async () => {
    // 4 bars holds 10 whole loops and 0.1125 beats over. t5's unlooped clip
    // has no more file content to stretch into, and says so on its own entry;
    // the looping clip on t4 must not join it.
    const { copies, entries } = await duplicateAndReadCopies({
      type: "scene",
      path: "s0",
      toPath: `[${TARGET_BAR}|1]`,
      arrangementLength: "4bar",
    });

    expectWholeLoopTiles(copies, 10, "n0.1125/4");

    const withReasons = entries.filter((entry) => entry.reason != null);

    expect(withReasons).toStrictEqual([
      expect.objectContaining({
        path: `t5[${TARGET_BAR}|1]`,
        reason: expect.stringContaining("no more content"),
      }),
    ]);
  });
});

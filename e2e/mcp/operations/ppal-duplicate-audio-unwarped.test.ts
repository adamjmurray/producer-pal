// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for duplicating an unwarped audio clip to the arrangement.
 *
 * Duplicate measures a source clip with `clipLengthBeats`, which reads audio
 * through the markers. Live's own `Clip.length` freezes at the tempo the sample
 * came in at once warping is off, so the two only disagree after a tempo
 * change — which is what the scene test sets up.
 *
 * Uses: e2e-test-set - t5 "Audio 2" and t8 "9-MIDI" (free slots), s7 (empty)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-audio-unwarped
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import {
  createUnwarpedDrumLoop,
  halveDrumLoopRegion,
} from "../clip/helpers/audio-warp-test-helpers.ts";
import { AUDIO_TRACK, EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** s7 is the empty scene, so the scene's length is only what these tests put in it. */
const SCENE = 7;
/** t8 "9-MIDI" is empty in e2e-test-set. */

/**
 * Call a tool and parse its result.
 * @param name - The tool name
 * @param args - The tool arguments
 * @returns The parsed result
 */
async function call<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await ctx.client!.callTool({ name, arguments: args });
  const data = parseToolResult<T>(result);

  await sleep(150);

  return data;
}

describe("ppal-duplicate with an unwarped audio source", () => {
  it("sizes an arrangement scene copy by the audio clip's real length", async () => {
    // The scene holds a 1-bar MIDI clip and the one-bar drum loop, unwarped.
    // Doubling the tempo doubles what the loop is worth in beats — 2.2222
    // seconds is 8 beats at 216 BPM — but leaves Live's Clip.length reporting
    // the 4 beats it froze at. So the scene is two bars long, and duplicating
    // it tiles the MIDI clip twice. Measure the loop by Clip.length instead and
    // the scene comes out one bar, fitting the MIDI clip once.
    await call("ppal-create-clip", {
      path: `t${EMPTY_MIDI_TRACK}/s${SCENE}`,
      notes: "C3 1|1",
      length: "1bar",
    });
    await createUnwarpedDrumLoop(ctx.client!, `t${AUDIO_TRACK}/s${SCENE}`);
    await call("ppal-update-live-set", { tempo: 216 });

    const liveSet = await call<{ scenes: Array<{ id: string }> }>(
      "ppal-read-live-set",
      { include: ["scenes"] },
    );
    const dup = await call<{
      clips: Array<{ id: string; path: string }>;
    }>("ppal-duplicate", {
      type: "scene",
      id: liveSet.scenes[SCENE]!.id,
      arrangementStart: "49|1",
    });
    // An arrangement clip's path is its track, so the MIDI copies are the ones
    // whose path is the MIDI track itself.
    const midiCopies = dup.clips.filter(
      (c) => c.path === `t${EMPTY_MIDI_TRACK}`,
    );
    const starts = [];

    for (const copy of midiCopies) {
      const clip = await call<ReadClipResult>("ppal-read-clip", {
        id: copy.id,
      });

      starts.push(clip.arrangementStart);
    }

    expect(starts).toStrictEqual(["49|1", "50|1"]);
  });

  it("fills arrangementLength from an unwarped source clip", async () => {
    // The audio-clip duplicate path measures the source the same way, but the
    // measurement can't be seen from out here: Live's own copy already spans
    // whatever Clip.length says, so the branch that skips the resize lands on
    // the same span the resize would have produced. What this does cover is the
    // round trip itself — nothing else in e2e duplicates an audio clip with a
    // length, and the audio timing rewrite runs underneath all of it.
    const clipId = await createUnwarpedDrumLoop(
      ctx.client!,
      `t${AUDIO_TRACK}/s1`,
    );

    await halveDrumLoopRegion(ctx.client!, clipId);

    const copy = await call<{ id: string }>("ppal-duplicate", {
      type: "clip",
      id: clipId,
      arrangementStart: "49|1",
      arrangementLength: "1bar",
    });
    const clip = await call<ReadClipResult>("ppal-read-clip", {
      id: copy.id,
      include: ["*"],
    });

    expect(clip.arrangementStart).toBe("49|1");
    expect(clip.arrangementLength).toBe("1bar");
    expect(clip.warping).toBe(false);
  });
});

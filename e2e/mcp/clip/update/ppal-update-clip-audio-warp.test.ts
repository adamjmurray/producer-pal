// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-clip's audio warp handling: switching `warping`,
 * the `looping: true` veto, and writing a region to a clip whose markers Live
 * reports in seconds. The create-path counterparts live in
 * ../ppal-create-clip.test.ts; the shared setup is in the helpers module.
 *
 * Uses: e2e-test-set - t5 "Audio 2" (free slots, empty arrangement)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-audio-warp
 */
import { describe, expect, it } from "vitest";
import {
  abletonBeatsToDuration,
  durationToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import {
  DRUM_LOOP_FILE,
  type ReadClipResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers";
import {
  createAndRead,
  expectedSampleLength,
  readSongTiming,
  sampleBeats,
  type SongTiming,
} from "../helpers/audio-warp-test-helpers.ts";
import { updateAndRead } from "../helpers/clip-io-test-helpers.ts";
import { AUDIO_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

const SLOT_PATH = `t${AUDIO_TRACK}/s1`;

/**
 * A clip's reported length in real Ableton beats.
 * @param clip - A clip read back from Live
 * @param song - The Set's tempo and meter
 * @returns The length in beats
 */
function lengthBeats(clip: ReadClipResult, song: SongTiming): number {
  return durationToAbletonBeats(clip.length!, song.numerator, song.denominator);
}

/**
 * Half the sample's duration, as a bar|beat duration string. Short enough that
 * a region set to it is visibly not the whole sample.
 * @param clip - A clip read with the sample include
 * @param song - The Set's tempo and meter
 * @returns The duration string
 */
function halfSampleDuration(clip: ReadClipResult, song: SongTiming): string {
  return abletonBeatsToDuration(
    sampleBeats(clip, song) / 2,
    song.numerator,
    song.denominator,
  );
}

describe("ppal-update-clip audio warping", () => {
  it("keeps the region across a warp round trip", async () => {
    // Live's two directions are asymmetric: it maps the markers from seconds
    // into beats on the way in, but leaves end_marker holding the beat number
    // on the way out, where it reads as seconds. unwarpAudioClip restates it.
    // Skip that restatement and this re-warp maps a beat value that is already
    // in beats, stretching the clip by tempo/60.
    const song = await readSongTiming(ctx.client!);
    const { created } = await createAndRead(ctx.client!, {
      path: SLOT_PATH,
      name: "warp round trip",
      warping: true,
    });

    const unwarped = await updateAndRead(ctx.client!, created.id, {
      warping: false,
    });

    expect(unwarped.clip.warping).toBe(false);
    expect(unwarped.clip.length).toBe(
      expectedSampleLength(unwarped.clip, song),
    );

    const rewarped = await updateAndRead(ctx.client!, created.id, {
      warping: true,
    });

    expect(rewarped.clip.warping).toBe(true);
    expect(rewarped.clip.length).toBe(
      expectedSampleLength(rewarped.clip, song),
    );
  });

  it("survives an unwarp then re-warp without inflating the region", async () => {
    // Same round trip from the other end: a clip Live never warped, so the
    // markers start out in seconds and the first switch is the one into beats.
    const song = await readSongTiming(ctx.client!);
    const { created } = await createAndRead(ctx.client!, {
      path: `t${AUDIO_TRACK}`,
      arrangementStart: "49|1",
      name: "warp round trip",
      warping: false,
    });

    const { clip } = await updateAndRead(ctx.client!, created.id, {
      warping: true,
    });

    expect(clip.warping).toBe(true);
    expect(clip.length).toBe(expectedSampleLength(clip, song));
  });

  it("warns that looping: true wins over warping: false", async () => {
    // Only the warning and the two flags. ppal-update-clip-loop-toggle covers
    // what the skipped unwarp would have done to the region.
    const { created } = await createAndRead(ctx.client!, {
      path: SLOT_PATH,
      name: "looping veto",
      warping: true,
    });

    const { clip, warnings } = await updateAndRead(ctx.client!, created.id, {
      looping: true,
      warping: false,
    });

    expect(warnings.join("\n")).toContain("warping: false ignored");
    expect(clip.warping).toBe(true);
    expect(clip.looping).toBe(true);
  });

  it("warps an unwarped clip when looping is switched on", async () => {
    // Live turns warping back on by itself here; forceWarpForLooping does it up
    // front so the region math stays on one side of the unit switch.
    const song = await readSongTiming(ctx.client!);
    const { created } = await createAndRead(ctx.client!, {
      path: SLOT_PATH,
      name: "looping forces warp",
      warping: false,
    });

    const { clip } = await updateAndRead(ctx.client!, created.id, {
      looping: true,
    });

    expect(clip.warping).toBe(true);
    expect(clip.looping).toBe(true);
    expect(clip.length).toBe(expectedSampleLength(clip, song));
  });

  it("keeps a region requested in the same call as warping: false", async () => {
    // Switching warp off resets end_marker to the whole sample, so it has to
    // happen before the region write rather than after it — otherwise the
    // requested region is written and then thrown away.
    const song = await readSongTiming(ctx.client!);
    const { created, clip: whole } = await createAndRead(ctx.client!, {
      path: SLOT_PATH,
      name: "unwarp with region",
      warping: true,
    });
    const halfSample = halfSampleDuration(whole, song);

    const { clip } = await updateAndRead(ctx.client!, created.id, {
      warping: false,
      start: "1|1",
      length: halfSample,
    });

    expect(clip.warping).toBe(false);
    expect(lengthBeats(clip, song)).toBeCloseTo(
      sampleBeats(whole, song) / 2,
      2,
    );
  });

  it("reports a bar-long sample as exactly one bar, warped or not", async () => {
    // The one assertion the sub-bar sample can't make: a whole number of bars.
    // `n/1` is a whole note — one bar in 4/4. Every other length here comes out
    // of the same conversion the code under test uses, so a shared error would
    // cancel; this literal is independent of it, and a tempo or unit slip lands
    // off the bar line as a fraction rather than a round note value.
    const { created, clip: unwarped } = await createAndRead(ctx.client!, {
      sampleFile: DRUM_LOOP_FILE,
      path: SLOT_PATH,
      name: "one bar loop",
      warping: false,
    });

    expect(unwarped.warping).toBe(false);
    expect(unwarped.start).toBe("1|1");
    expect(unwarped.length).toBe("n/1");

    const { clip } = await updateAndRead(ctx.client!, created.id, {
      warping: true,
    });

    expect(clip.warping).toBe(true);
    expect(clip.length).toBe("n/1");
  });

  it("writes a region to an unwarped clip in the unit Live is using", async () => {
    // start/length arrive as beats but land in properties holding seconds, so
    // the write has to divide by tempo/60. Skip that and half the sample asks
    // for a region tempo/60 times too long, which Live clamps to the whole
    // file — leaving the clip looking untouched.
    const song = await readSongTiming(ctx.client!);
    const { created, clip: whole } = await createAndRead(ctx.client!, {
      path: SLOT_PATH,
      name: "unwarped region write",
      warping: false,
    });
    const halfSample = halfSampleDuration(whole, song);

    const shortened = await updateAndRead(ctx.client!, created.id, {
      start: "1|1",
      length: halfSample,
    });

    expect(shortened.clip.warping).toBe(false);
    expect(lengthBeats(shortened.clip, song)).toBeCloseTo(
      sampleBeats(whole, song) / 2,
      2,
    );

    // read-clip's own length has to be writable back unchanged: it comes from
    // markers clamped to the sample, so the write side has to clamp the same
    // way or handing it back moves the region.
    const restored = await updateAndRead(ctx.client!, created.id, {
      start: "1|1",
      length: whole.length,
    });

    expect(restored.clip.length).toBe(whole.length);
  });
});

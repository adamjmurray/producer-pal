// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for arrangement clip duplication crash workaround.
 * Verifies that duplicating an arrangement clip over an existing arrangement clip
 * doesn't crash Ableton Live (bug reported to Ableton).
 *
 * Tests all 4 overlap types (before-start, exact-start, middle, near-end) for
 * both MIDI and audio clips, plus session-to-arrangement sanity checks.
 * Uses: e2e-test-set (t8 = empty MIDI track, t5 = audio track with sample)
 *
 * Run with: npm run e2e:mcp -- --testPathPattern ppal-duplicate-arrangement-crash-workaround
 */
import { beforeAll, describe, expect, it } from "vitest";
import { durationToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import {
  parseToolResult,
  KICK_FILE,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { AUDIO_TRACK, EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";
import { arrangementStartOf } from "../clip/helpers/arrangement-start-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

interface DuplicateClipResult {
  id: string;
  /** Where the copy landed, e.g. "t0[5|1]" */
  path?: string;
  /** What the copy did to the clips it landed on, when it did anything. */
  detail?: string;
  /** The clips of a copy that was tiled to fill a length. */
  clips?: DuplicateClipResult[];
}

interface TrackResult {
  arrangementClips?: ReadClipResult[];
}

/**
 * Duplicate a clip to arrangement at a given position.
 * @param id - Source clip ID
 * @param position - Target position in bar|beat format
 * @returns The duplicated clip's metadata
 */
async function dupToArr(
  id: string,
  position: string,
): Promise<DuplicateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-duplicate",
    arguments: {
      type: "clip",
      id,
      toPath: `[${position}]`,
    },
  });
  const clip = parseToolResult<DuplicateClipResult>(result);

  await sleep(100);

  return clip;
}

/**
 * The detail of a copy, which a tiled copy carries on its first clip.
 * @param copy - The copy's entry
 * @returns Its detail
 */
function firstDetail(copy: DuplicateClipResult): string | undefined {
  return copy.detail ?? copy.clips?.[0]?.detail;
}

/**
 * Duplicate a clip to an arrangement position, stretched to a length.
 * @param id - Source clip ID
 * @param position - Target position in bar|beat format
 * @param arrangementLength - How long the copy should be, e.g. "2bar"
 * @returns The duplicated clip's metadata
 */
async function dupToArrLong(
  id: string,
  position: string,
  arrangementLength: string,
): Promise<DuplicateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-duplicate",
    arguments: { type: "clip", id, toPath: `[${position}]`, arrangementLength },
  });
  const clip = parseToolResult<DuplicateClipResult>(result);

  await sleep(100);

  return clip;
}

/**
 * Duplicate a clip to several arrangement positions in one call.
 * @param id - Source clip ID
 * @param positions - Target positions in bar|beat format, one copy each
 * @returns One entry per copy, in the order given
 */
async function dupToArrMany(
  id: string,
  positions: string[],
): Promise<DuplicateClipResult[]> {
  const result = await ctx.client!.callTool({
    name: "ppal-duplicate",
    arguments: {
      type: "clip",
      id,
      toPath: positions.map((position) => `[${position}]`).join(","),
    },
  });
  const copies = parseToolResult<DuplicateClipResult[]>(result);

  await sleep(100);

  return copies;
}

/**
 * Read all arrangement clips on a track.
 * @param trackIndex - Track index
 * @returns Array of arrangement clip data
 */
async function readArrClips(trackIndex: number): Promise<ReadClipResult[]> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-track",
    arguments: {
      path: `t${trackIndex}`,
      include: ["arrangement-clips", "timing"],
    },
  });

  return parseToolResult<TrackResult>(result).arrangementClips ?? [];
}

/**
 * Filter clips whose bar number falls within [minBar, maxBar].
 * @param clips - Array of clip results
 * @param minBar - Minimum bar number (inclusive)
 * @param maxBar - Maximum bar number (inclusive)
 * @returns Filtered clips
 */
function clipsInBarRange(
  clips: ReadClipResult[],
  minBar: number,
  maxBar: number,
): ReadClipResult[] {
  return clips.filter((c) => {
    const start = arrangementStartOf(c);

    if (start == null) {
      return false;
    }

    const barStr = start.split("|")[0];

    if (!barStr) {
      return false;
    }

    const bar = parseInt(barStr, 10);

    return bar >= minBar && bar <= maxBar;
  });
}

/**
 * Parse an arrangementLength duration string to absolute Ableton beats (4/4).
 * Reuses the canonical parser so it handles every output shape: "<count>bar",
 * "n<fraction>", "<count>bar+n<fraction>", and off-grid bare beats.
 * @param length - Arrangement length duration string (e.g. "1bar", "n/2")
 * @returns Length in Ableton beats (quarter notes)
 */
function parseLengthToBeats(length: string): number {
  return durationToAbletonBeats(length, 4, 4);
}

/**
 * Parse a "bar|beat" position to absolute beats (assumes 4/4).
 * @param barBeat - Position in "bar|beat" format (e.g., "133|1")
 * @returns Position in absolute beats
 */
function parseStartToBeats(barBeat: string): number {
  const [bar, beat] = barBeat.split("|");

  return (parseInt(bar!) - 1) * 4 + (parseFloat(beat!) - 1);
}

/**
 * Convert absolute beats to "bar|beat" string (assumes 4/4).
 * @param beats - Absolute beats
 * @returns Position in "bar|beat" format
 */
function beatsToBarBeat(beats: number): string {
  const bar = Math.floor(beats / 4) + 1;
  const beat = Math.round(((beats % 4) + 1) * 100) / 100;

  return `${bar}|${beat}`;
}

/**
 * Get the arrangement length of a clip in beats by matching its position.
 * @param trackIndex - Track index
 * @param position - Position in bar|beat format to match
 * @returns Length in beats
 */
async function getClipLengthBeatsAtPosition(
  trackIndex: number,
  position: string,
): Promise<number> {
  const clips = await readArrClips(trackIndex);
  const clip = clips.find((c) => arrangementStartOf(c) === position);

  if (!clip?.arrangementLength) {
    throw new Error(
      `Clip at ${position} not found or missing arrangementLength`,
    );
  }

  return parseLengthToBeats(clip.arrangementLength);
}

describe("arrangement clip duplication crash workaround", () => {
  // Session clip IDs (created in beforeAll, reused across tests)
  let midiLongId: string; // 4-bar MIDI
  let midiShortId: string; // 1-bar MIDI
  let audioLongId: string; // sample.aiff (longer)
  let audioShortId: string; // kick.aiff (shorter)

  beforeAll(async () => {
    // 4-bar MIDI session clip on t8/s0
    const midiLong = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s0`,
        notes: "C3 1|1",
        length: "4bar",
      },
    });

    midiLongId = parseToolResult<{ id: string }>(midiLong).id;

    // 1-bar MIDI session clip on t8/s1
    const midiShort = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s1`,
        notes: "C3 1|1",
        length: "1bar",
      },
    });

    midiShortId = parseToolResult<{ id: string }>(midiShort).id;

    // Read existing session sample clip on t5/s0 (sample.aiff — the longer one)
    const sample = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: `t${AUDIO_TRACK}/s0` },
    });

    audioLongId = parseToolResult<{ id: string }>(sample).id;

    // Create session kick clip on t5/s1 (kick.aiff — the shorter one)
    const kick = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${AUDIO_TRACK}/s1`,
        sampleFile: KICK_FILE,
      },
    });

    audioShortId = parseToolResult<{ id: string }>(kick).id;

    await sleep(200);
  });

  describe("MIDI", () => {
    it("overlaps before start of larger clip without crashing", async () => {
      // 4-bar clip at 43|1 (extends to 47|1), 1-bar source at 49|1
      await dupToArr(midiLongId, "43|1");
      const shortArr = await dupToArr(midiShortId, "49|1");

      // Crash scenario: dup 1-bar to 42|3 — overlaps [43|1, 43|3] of 4-bar
      const result = await dupToArr(shortArr.id, "42|3");

      expect(result.id).toBeDefined();
      expect(arrangementStartOf(result)).toBe("42|3");

      // 3 clips: dup at 42|3, trimmed 4-bar (after portion), source at 49|1
      const clips = await readArrClips(EMPTY_MIDI_TRACK);
      const relevant = clipsInBarRange(clips, 42, 50);

      expect(relevant).toHaveLength(3);
    });

    it("overlaps exact start of larger clip without crashing", async () => {
      // 4-bar clip at 61|1, 1-bar clip at 69|1
      await dupToArr(midiLongId, "61|1");
      const shortArr = await dupToArr(midiShortId, "69|1");

      // Crash scenario: duplicate 1-bar arrangement clip onto start of 4-bar
      const result = await dupToArr(shortArr.id, "61|1");

      expect(result.id).toBeDefined();
      expect(arrangementStartOf(result)).toBe("61|1");

      // 3 clips: 1-bar at 61|1, truncated 3-bar, original 1-bar at 69|1
      const clips = await readArrClips(EMPTY_MIDI_TRACK);
      const relevant = clipsInBarRange(clips, 61, 70);

      expect(relevant).toHaveLength(3);
    });

    it("overlaps middle of larger clip (contained) without crashing", async () => {
      // 4-bar clip at 81|1, 1-bar clip at 89|1
      await dupToArr(midiLongId, "81|1");
      const shortArr = await dupToArr(midiShortId, "89|1");

      // Crash scenario: duplicate 1-bar arrangement clip into middle of 4-bar
      const result = await dupToArr(shortArr.id, "83|1");

      expect(result.id).toBeDefined();
      expect(arrangementStartOf(result)).toBe("83|1");

      // 4 clips: before (81-83), duplicated (83-84), after (84-85), original (89)
      const clips = await readArrClips(EMPTY_MIDI_TRACK);
      const relevant = clipsInBarRange(clips, 81, 90);

      expect(relevant).toHaveLength(4);
    });

    it("overlaps near end extending beyond larger clip without crashing", async () => {
      // 4-bar clip at 73|1 (extends to 77|1), 1-bar source at 79|1
      await dupToArr(midiLongId, "73|1");
      const shortArr = await dupToArr(midiShortId, "79|1");

      // Crash scenario: dup 1-bar to 76|3 — overlaps [76|3, 77|1] of 4-bar
      const result = await dupToArr(shortArr.id, "76|3");

      expect(result.id).toBeDefined();
      expect(arrangementStartOf(result)).toBe("76|3");

      // 3 clips: trimmed 4-bar (before portion), dup at 76|3, source at 79|1
      const clips = await readArrClips(EMPTY_MIDI_TRACK);
      const relevant = clipsInBarRange(clips, 73, 80);

      expect(relevant).toHaveLength(3);
    });
  });

  describe("audio", () => {
    it("overlaps before start of larger clip without crashing", async () => {
      // Sample at 133|1 (natural length ~1.1s), kick source at 139|1
      await dupToArr(audioLongId, "133|1");
      const kickArr = await dupToArr(audioShortId, "139|1");

      // Read kick's actual arrangement length to compute overlap position
      const kickBeats = await getClipLengthBeatsAtPosition(
        AUDIO_TRACK,
        "139|1",
      );
      const sampleStartBeats = parseStartToBeats("133|1");

      // Place kick so it starts half its length before sample → guaranteed overlap
      const targetBeats = sampleStartBeats - kickBeats / 2;
      const targetPos = beatsToBarBeat(targetBeats);

      // Crash scenario: dup kick arrangement clip to just before sample start
      const result = await dupToArr(kickArr.id, targetPos);

      expect(result.id).toBeDefined();

      // 3 clips: dup kick, trimmed sample (after portion), source kick at 139|1
      const clips = await readArrClips(AUDIO_TRACK);
      const relevant = clipsInBarRange(clips, 132, 140);

      expect(relevant).toHaveLength(3);
    });

    it("overlaps exact start of larger clip without crashing", async () => {
      // sample.aiff at 101|1, kick.aiff at 105|1
      await dupToArr(audioLongId, "101|1");
      const shortArr = await dupToArr(audioShortId, "105|1");

      // Crash scenario: duplicate kick arrangement clip onto start of sample
      const result = await dupToArr(shortArr.id, "101|1");

      expect(result.id).toBeDefined();
      expect(arrangementStartOf(result)).toBe("101|1");

      // 3 clips: kick at 101|1, partial sample, original kick at 105|1
      const clips = await readArrClips(AUDIO_TRACK);
      const relevant = clipsInBarRange(clips, 101, 106);

      expect(relevant).toHaveLength(3);
    });

    it("overlaps middle of larger clip (contained) without crashing", async () => {
      // sample.aiff at 121|1, kick.aiff at 125|1
      await dupToArr(audioLongId, "121|1");
      const shortArr = await dupToArr(audioShortId, "125|1");

      // Crash scenario: duplicate kick into middle of sample (~1 beat in)
      const result = await dupToArr(shortArr.id, "121|2");

      expect(result.id).toBeDefined();

      // 4 clips: before sample, kick in middle, after sample, original kick at 125|1
      const clips = await readArrClips(AUDIO_TRACK);
      const relevant = clipsInBarRange(clips, 121, 126);

      expect(relevant).toHaveLength(4);
    });

    it("overlaps near end extending beyond larger clip without crashing", async () => {
      // Sample at 143|1 (natural length ~1.1s), kick source at 149|1
      await dupToArr(audioLongId, "143|1");
      const kickArr = await dupToArr(audioShortId, "149|1");

      // Read both clips' actual arrangement lengths
      const kickBeats = await getClipLengthBeatsAtPosition(
        AUDIO_TRACK,
        "149|1",
      );
      const sampleStartBeats = parseStartToBeats("143|1");

      // Read sample's actual end position
      const sampleLengthBeats = await getClipLengthBeatsAtPosition(
        AUDIO_TRACK,
        "143|1",
      );
      const sampleEndBeats = sampleStartBeats + sampleLengthBeats;

      // Place kick so it starts half its length before sample end → extends past
      const targetBeats = sampleEndBeats - kickBeats / 2;
      const targetPos = beatsToBarBeat(targetBeats);

      // Crash scenario: dup kick near end of sample, extending beyond
      const result = await dupToArr(kickArr.id, targetPos);

      expect(result.id).toBeDefined();

      // 3 clips: trimmed sample (before portion), dup kick, source kick at 149|1
      const clips2 = await readArrClips(AUDIO_TRACK);
      const relevant = clipsInBarRange(clips2, 143, 150);

      expect(relevant).toHaveLength(3);
    });
  });

  describe("session-to-arrangement (sanity)", () => {
    it("MIDI session clip onto existing arrangement clip does not crash", async () => {
      // Place arrangement clip, then dup session clip on top — should not crash
      await dupToArr(midiLongId, "51|1");
      const result = await dupToArr(midiShortId, "51|1");

      expect(result.id).toBeDefined();
      expect(arrangementStartOf(result)).toBe("51|1");
    });

    it("audio session clip onto existing arrangement clip does not crash", async () => {
      // Place arrangement clip, then dup session clip on top — should not crash
      await dupToArr(audioLongId, "151|1");
      const result = await dupToArr(audioShortId, "151|1");

      expect(result.id).toBeDefined();
      expect(arrangementStartOf(result)).toBe("151|1");
    });
  });

  // Live reports none of what a copy does to the clips it lands on, so the
  // copy's own entry says it. Bars 301+ keep these clear of the tests above.
  describe("what a copy reports about the clips it landed on", () => {
    const track = `t${EMPTY_MIDI_TRACK}`;

    it("says it overwrote a clip it covered whole", async () => {
      await dupToArr(midiShortId, "301|1");
      const result = await dupToArr(midiShortId, "301|1");

      expect(result.detail).toBe(`overwrote the clip at ${track}[301|1]`);
    });

    // A write starting exactly where a clip starts makes Live re-create the
    // rest of the clip, so the rest answers to the next bar.
    it("says it shortened a clip it covered the front of", async () => {
      await dupToArr(midiLongId, "309|1");
      const result = await dupToArr(midiShortId, "309|1");

      expect(result.detail).toBe(`shortened the clip at ${track}[310|1]`);
    });

    it("says it shortened a clip it covered the end of", async () => {
      await dupToArr(midiLongId, "325|1");
      const result = await dupToArr(midiShortId, "328|1");

      expect(result.detail).toBe(`shortened the clip at ${track}[325|1]`);
    });

    it("says it split a clip it landed inside", async () => {
      await dupToArr(midiLongId, "317|1");
      const result = await dupToArr(midiShortId, "318|1");

      expect(result.detail).toBe(
        `split the clip at ${track}[317|1] into ${track}[317|1] and ${track}[319|1]`,
      );
    });

    it("says nothing about a copy that landed in free space", async () => {
      const result = await dupToArr(midiShortId, "333|1");

      expect(result.detail).toBeUndefined();
    });

    // An arrangement source goes through the crash workaround, which clears the
    // landing by hand: the clip is cut with a holding-area copy, and the part
    // past the landing is re-created under a new id.
    it("says what an arrangement-source copy cut off the front of a clip", async () => {
      await dupToArr(midiLongId, "361|1");

      const source = await dupToArr(midiShortId, "369|1");
      const result = await dupToArr(source.id, "361|1");

      expect(result.detail).toBe(`shortened the clip at ${track}[362|1]`);
    });

    it("says what an arrangement-source copy split", async () => {
      await dupToArr(midiLongId, "381|1");

      const source = await dupToArr(midiShortId, "389|1");
      const result = await dupToArr(source.id, "383|1");

      expect(result.detail).toBe(
        `split the clip at ${track}[381|1] into ${track}[381|1] and ${track}[384|1]`,
      );
    });

    // The copy is 1 bar and then grown to 2 bars, over a clip it lands beside.
    it("says what a lengthened copy overwrote, once", async () => {
      await dupToArr(midiShortId, "402|1");

      const result = await dupToArrLong(midiShortId, "401|1", "2bar");

      expect(firstDetail(result)).toBe(`overwrote the clip at ${track}[402|1]`);
    });

    // The copy splits the 4-bar clip at 421|1, and growing it cuts the tail it
    // just left. Update-clip would name that tail; the clip that was there is
    // one, split into its head and what is left at 424|1.
    it("says what a lengthened copy did to a clip it split, once", async () => {
      await dupToArr(midiLongId, "421|1");

      const result = await dupToArrLong(midiShortId, "422|1", "2bar");

      expect(firstDetail(result)).toBe(
        `split the clip at ${track}[421|1] into ${track}[421|1] and ${track}[424|1]`,
      );
    });

    // Two 2-bar copies of one call, the second starting a bar into the first.
    // The first is cut short at the back and keeps its id, so its entry says it
    // was shortened; the second only overwrote its own earlier copy, which is the
    // first one's to report.
    it("says an earlier copy of the call was trimmed by a later one", async () => {
      const twoBar = parseToolResult<{ id: string }>(
        await ctx.client!.callTool({
          name: "ppal-create-clip",
          arguments: {
            path: `t${EMPTY_MIDI_TRACK}/s2`,
            notes: "C3 1|1",
            length: "2bar",
          },
        }),
      ).id;

      await sleep(100);

      const copies = await dupToArrMany(twoBar, ["441|1", "442|1"]);

      expect(copies.map((copy) => copy.detail)).toStrictEqual([
        `shortened by ${track}[442|1] later in this call`,
        undefined,
      ]);
    });

    // One 4-bar clip at 341|1, and a 1-bar copy of the same call on each of its
    // bars. The first copy starts exactly where the clip does, so Live deletes
    // the clip and re-creates the 3 bars left under a new id; the second starts
    // exactly where that rest does, and so on. The last copy covers the last
    // bar exactly, so what is left of the clip is gone.
    it("says what each copy of one call did to the clip they ate", async () => {
      await dupToArr(midiLongId, "341|1");

      const copies = await dupToArrMany(midiShortId, [
        "341|1",
        "342|1",
        "343|1",
        "344|1",
      ]);

      expect(copies.map((copy) => copy.detail)).toStrictEqual([
        `shortened the clip at ${track}[342|1]`,
        `shortened the clip at ${track}[343|1]`,
        `shortened the clip at ${track}[344|1]`,
        `overwrote the clip at ${track}[344|1]`,
      ]);
    });
  });
});

describe("a lengthened copy over an earlier copy in the same call", () => {
  // The lengthened copy covers the earlier one whole, so that one is never
  // written; the lengthened one reports what was already on the lane, which
  // includes the clip the earlier copy would have landed on.
  it("leaves the earlier copy unwritten and reports what was already there", async () => {
    const track = `t${EMPTY_MIDI_TRACK}`;

    // One bar each at bars 931, 933 and 935, and a one-bar looping source.
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `${track}[931|1],${track}[933|1],${track}[935|1]`,
        notes: "C3 1|1",
        length: "1bar",
      },
    });

    const source = parseToolResult<{ id: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          path: `${track}/s3`,
          notes: "C3 1|1",
          length: "1bar",
          looping: true,
        },
      }),
    ).id;

    await sleep(200);

    // The second copy is three bars, so it covers 931-933 and the first copy
    // with them: the first is never written, and the second overwrites the
    // clips at 931 and 933.
    const [first, second] = parseToolResult<
      [{ path: string; detail: string }, DuplicateClipResult]
    >(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "clip",
          id: source,
          toPath: `${track}[933|1],${track}[931|1]`,
          arrangementLength: "1bar,3bar",
        },
      }),
    );

    await sleep(200);

    expect(first).toStrictEqual({
      path: `${track}[933|1]`,
      detail: `overwritten later in this call by ${track}[931|1]`,
    });
    expect(firstDetail(second)).toContain(
      `overwrote the clip at ${track}[931|1]`,
    );
    expect(firstDetail(second)).toContain(
      `overwrote the clip at ${track}[933|1]`,
    );

    const filled = clipsInBarRange(
      await readArrClips(EMPTY_MIDI_TRACK),
      931,
      934,
    );
    const beats = filled.reduce(
      (sum, clip) => sum + parseLengthToBeats(clip.arrangementLength as string),
      0,
    );

    // Three bars from 931 are filled, and the clip at 935 was left alone.
    expect(filled.map(arrangementStartOf)).toContain("931|1");
    expect(beats).toBe(12);
    expect(
      clipsInBarRange(await readArrClips(EMPTY_MIDI_TRACK), 935, 935),
    ).toHaveLength(1);
  });
});

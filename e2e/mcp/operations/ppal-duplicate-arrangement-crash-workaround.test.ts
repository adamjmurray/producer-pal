// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
import {
  KICK_FILE,
  parseToolResult,
  type ReadClipResult,
  resetConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

interface DuplicateClipResult {
  id: string;
  arrangementStart?: string;
}

interface TrackResult {
  arrangementClips?: ReadClipResult[];
}

const MIDI_TRACK = 8;
const AUDIO_TRACK = 5;

/**
 * Duplicate a clip to arrangement at a given position.
 * @param id - Source clip ID
 * @param arrangementStart - Target position in bar|beat format
 * @returns The duplicated clip's metadata
 */
async function dupToArr(
  id: string,
  arrangementStart: string,
): Promise<DuplicateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-duplicate",
    arguments: {
      type: "clip",
      id,
      destination: "arrangement",
      arrangementStart,
    },
  });
  const clip = parseToolResult<DuplicateClipResult>(result);

  await sleep(100);

  return clip;
}

/**
 * Read all arrangement clips on a track.
 * @param trackIndex - Track index
 * @returns Array of arrangement clip data
 */
async function readArrClips(trackIndex: number): Promise<ReadClipResult[]> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-track",
    arguments: { trackIndex, include: ["arrangement-clips", "timing"] },
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
    if (!c.arrangementStart) return false;
    const barStr = c.arrangementStart.split("|")[0];

    if (!barStr) return false;
    const bar = parseInt(barStr, 10);

    return bar >= minBar && bar <= maxBar;
  });
}

/**
 * Parse arrangementLength "bar:beat" string to absolute beats (assumes 4/4).
 * @param length - Arrangement length in "bar:beat" format (e.g., "0:2.200")
 * @returns Length in beats
 */
function parseLengthToBeats(length: string): number {
  const [bars, beats] = length.split(":");

  return parseInt(bars!) * 4 + parseFloat(beats!);
}

/**
 * Parse arrangementStart "bar|beat" string to absolute beats (assumes 4/4).
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
 * @param arrangementStart - Position in bar|beat format to match
 * @returns Length in beats
 */
async function getClipLengthBeatsAtPosition(
  trackIndex: number,
  arrangementStart: string,
): Promise<number> {
  const clips = await readArrClips(trackIndex);
  const clip = clips.find((c) => c.arrangementStart === arrangementStart);

  if (!clip?.arrangementLength) {
    throw new Error(
      `Clip at ${arrangementStart} not found or missing arrangementLength`,
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
    // Enable JSON output before creating clips (beforeEach hasn't run yet)
    await resetConfig();
    await sleep(50);

    // 4-bar MIDI session clip on t8/s0
    const midiLong = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: MIDI_TRACK,
        sceneIndex: "0",
        notes: "C3 1|1",
        length: "4:0",
      },
    });

    midiLongId = parseToolResult<{ id: string }>(midiLong).id;

    // 1-bar MIDI session clip on t8/s1
    const midiShort = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: MIDI_TRACK,
        sceneIndex: "1",
        notes: "C3 1|1",
        length: "1:0",
      },
    });

    midiShortId = parseToolResult<{ id: string }>(midiShort).id;

    // Read existing session sample clip on t5/s0 (sample.aiff — the longer one)
    const sample = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { trackIndex: AUDIO_TRACK, sceneIndex: 0 },
    });

    audioLongId = parseToolResult<{ id: string }>(sample).id;

    // Create session kick clip on t5/s1 (kick.aiff — the shorter one)
    const kick = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        view: "session",
        trackIndex: AUDIO_TRACK,
        sceneIndex: "1",
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
      expect(result.arrangementStart).toBe("42|3");

      // 3 clips: dup at 42|3, trimmed 4-bar (after portion), source at 49|1
      const clips = await readArrClips(MIDI_TRACK);
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
      expect(result.arrangementStart).toBe("61|1");

      // 3 clips: 1-bar at 61|1, truncated 3-bar, original 1-bar at 69|1
      const clips = await readArrClips(MIDI_TRACK);
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
      expect(result.arrangementStart).toBe("83|1");

      // 4 clips: before (81-83), duplicated (83-84), after (84-85), original (89)
      const clips = await readArrClips(MIDI_TRACK);
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
      expect(result.arrangementStart).toBe("76|3");

      // 3 clips: trimmed 4-bar (before portion), dup at 76|3, source at 79|1
      const clips = await readArrClips(MIDI_TRACK);
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
      expect(result.arrangementStart).toBe("101|1");

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
      expect(result.arrangementStart).toBe("51|1");
    });

    it("audio session clip onto existing arrangement clip does not crash", async () => {
      // Place arrangement clip, then dup session clip on top — should not crash
      await dupToArr(audioLongId, "151|1");
      const result = await dupToArr(audioShortId, "151|1");

      expect(result.id).toBeDefined();
      expect(result.arrangementStart).toBe("151|1");
    });
  });
});

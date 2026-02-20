// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for arrangement clip duplication crash workaround.
 * Verifies that duplicating an arrangement clip over an existing arrangement clip
 * doesn't crash Ableton Live (bug reported to Ableton).
 *
 * Tests start-of-clip and middle-of-clip overlap for both MIDI and audio clips.
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
    arguments: { trackIndex, include: ["arrangement-clips"] },
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
    it("duplicates short clip onto start of longer clip without crashing", async () => {
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

    it("duplicates short clip into middle of longer clip without crashing", async () => {
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
  });

  describe("audio", () => {
    it("duplicates short clip onto start of longer clip without crashing", async () => {
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

    it("duplicates short clip into middle of longer clip without crashing", async () => {
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
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for drum detection through nested racks.
 *
 * A Drum Rack anywhere in a track's device tree puts the whole track in drum
 * mode: read-clip serializes drum lines instead of pitched chords, and
 * read-track reports a drum map. Two separate tree walks decide that, and
 * barbeat and stark are separate serializers, so each is asserted on its own.
 *
 * Uses: racks-test — t0 nests a Drum Rack in an Instrument Rack, t1 nests a
 * melodic instrument two racks deep for the negative case. Shapes the Live API
 * can build (a bare kit, a kit on a later chain or deeper, an Audio Effect
 * Rack) are made at runtime instead. See e2e/live-sets/racks-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- nested-rack-drum-detection
 */
import { describe, expect, it } from "vitest";
import {
  type CreateTrackResult,
  createTestDevice,
  createTestDeviceAt,
  createTwoPadDrumRack,
  parseToolResult,
  type ReadClipResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { RACKS_TEST_PATH } from "../helpers/racks-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

/**
 * Read a clip's notes in a given notation.
 * setupMcpTestContext resets the config before every test, so the notation has
 * to be set inside the test rather than in a hook.
 * @param path - Clip path
 * @param notation - Notation to serialize with
 * @returns The serialized notes
 */
async function readNotes(
  path: string,
  notation: "barbeat" | "stark",
): Promise<string> {
  await setConfig({ notation });

  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { path, include: ["notes"] },
  });

  return parseToolResult<ReadClipResult>(result).notes ?? "";
}

/**
 * Read a track's drum map.
 * @param trackIndex - 0-based track index
 * @returns The drum map, or undefined when the track isn't a drum track
 */
async function readDrumMap(
  trackIndex: number,
): Promise<Record<string, string> | undefined> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-track",
    arguments: { trackIndex, include: ["drum-map"] },
  });

  return parseToolResult<{ drumMap?: Record<string, string> }>(result).drumMap;
}

/**
 * Append a track to the Set.
 * @param name - Track name
 * @returns The new track's index
 */
async function createTrack(name: string): Promise<number> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-track",
    arguments: { name },
  });
  const track = parseToolResult<CreateTrackResult>(result);

  await sleep(100);

  return track.trackIndex as number;
}

/**
 * Put a clip in a track's first scene slot.
 * @param trackIndex - 0-based track index
 * @param notes - Notes in barbeat notation
 */
async function createClip(trackIndex: number, notes: string): Promise<void> {
  await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: { path: `t${trackIndex}/s0`, notes },
  });

  await sleep(100);
}

/**
 * Delete a track by index, so an appended track doesn't shift later reads.
 * @param trackIndex - 0-based track index
 */
async function deleteTrack(trackIndex: number): Promise<void> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-track",
    arguments: { trackIndex },
  });
  const track = parseToolResult<{ id: string }>(result);

  await ctx.client!.callTool({
    name: "ppal-delete",
    arguments: { type: "track", id: track.id },
  });

  await sleep(100);
}

describe("nested rack drum detection", () => {
  // t0: Instrument Rack "Outer" -> chain "Kit" -> Drum Rack "Kit".
  describe("a Drum Rack inside an Instrument Rack", () => {
    it("serializes the clip as drum lines in barbeat", async () => {
      expect(await readNotes("t0/s0", "barbeat")).toBe(
        "v100 n/16 C1 1|1,2,3\nE1 1|1\nF1 1|1.5x4@n/4\nD1 1|2,4",
      );
    });

    it("serializes the clip as drum lines in stark", async () => {
      expect(await readNotes("t0/s0", "stark")).toBe(
        [
          "kick /16: X z/8. X z/8. X",
          "snare /16: z/4 X z/4. z X",
          "snare2 /16: X",
          "tom4 /16: z/8 X z/8. X z/8. X z/8. X",
        ].join("\n"),
      );
    });

    it("reports a drum map on the track", async () => {
      expect(Object.values((await readDrumMap(0)) ?? {})).toStrictEqual([
        "Kick",
        "Snare",
        "Clap",
        "Sub Kit",
        "Drum Sampler",
        "Sampler",
        "Multi-Simpler",
      ]);
    });
  });

  // t1 nests Meld just as deep, with no Drum Rack anywhere in the tree.
  describe("a melodic instrument nested just as deep", () => {
    it("serializes the clip as pitched chords in barbeat", async () => {
      expect(await readNotes("t1/s0", "barbeat")).toBe(
        "v100 n/4 A2 C3 E3 1|1\nF2 A2 C3 1|2\nD2 A2 F3 1|3\nE2 B2 G3 1|4",
      );
    });

    it("serializes the clip as pitched chords in stark", async () => {
      expect(await readNotes("t1/s0", "stark")).toBe(
        "melody: [A, C E] [F, A, C] [D, A, F] [E, B, G]",
      );
    });

    it("reports no drum map on the track", async () => {
      expect(await readDrumMap(1)).toBeUndefined();
    });
  });

  // These shapes cost nothing to build through the Live API, so build them
  // here rather than freezing more structure into the fixture.
  describe("rack shapes built at runtime", () => {
    const DRUM_SHAPES = [
      {
        name: "directly on the track",
        build: async (track: number): Promise<void> => {
          await createTwoPadDrumRack(ctx.client!, `t${track}`);
        },
      },
      {
        name: "on a chain other than the first",
        build: async (track: number): Promise<void> => {
          const wrapper = await createTestDeviceAt(
            ctx.client!,
            "Instrument Rack",
            `t${track}`,
          );

          // c1 auto-creates chains 0 and 1, so the kit lands on the second.
          await createTwoPadDrumRack(ctx.client!, `${wrapper}/c1`);
        },
      },
      {
        name: "two Instrument Racks deep",
        build: async (track: number): Promise<void> => {
          const outer = await createTestDeviceAt(
            ctx.client!,
            "Instrument Rack",
            `t${track}`,
          );
          const inner = await createTestDeviceAt(
            ctx.client!,
            "Instrument Rack",
            `${outer}/c0`,
          );

          await createTwoPadDrumRack(ctx.client!, `${inner}/c0`);
        },
      },
    ];

    it.each(DRUM_SHAPES)("finds a Drum Rack $name", async ({ name, build }) => {
      const trackIndex = await createTrack(`Kit ${name}`);

      await build(trackIndex);

      expect(Object.keys((await readDrumMap(trackIndex)) ?? {})).toStrictEqual([
        "C1",
        "D1",
      ]);

      // Grouping by pitch (C1 twice on one line) only happens in drum mode;
      // pitched mode would stack C1 and D1 onto a shared 1|1 instead.
      await createClip(trackIndex, "C1 D1 1|1 C1 1|2");

      const notes = await readNotes(`t${trackIndex}/s0`, "barbeat");

      expect(notes).toContain("C1 1|1,2");
      expect(notes).not.toContain("C1 D1 1|1");

      await deleteTrack(trackIndex);
    });

    // An Audio Effect Rack has chains too, so the walk descends into it. It
    // holds no instrument, and must not read as a drum track.
    it("is not confused by an Audio Effect Rack's chains", async () => {
      const trackIndex = await createTrack("Effect Rack");

      await createTestDevice(ctx.client!, "Meld", `t${trackIndex}`);

      // Ask where the rack landed rather than assuming d1: a default track
      // preset can put devices on the track before we add any.
      const rack = await createTestDeviceAt(
        ctx.client!,
        "Audio Effect Rack",
        `t${trackIndex}`,
      );

      await createTestDevice(ctx.client!, "Reverb", `${rack}/c0`);

      expect(await readDrumMap(trackIndex)).toBeUndefined();

      await createClip(trackIndex, "C3 E3 1|1 C3 1|2");

      const notes = await readNotes(`t${trackIndex}/s0`, "barbeat");

      expect(notes).toContain("C3 E3 1|1");
      expect(notes).not.toContain("C3 1|1,2");

      await deleteTrack(trackIndex);
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the `instrument` field on track reads.
 *
 * An Instrument Rack reports what plays inside it — "Instrument Rack (Operator,
 * Wavetable)" — so the field says something about the sound. A Drum Rack stays
 * a leaf, nested or not, because the drum map carries its pads.
 *
 * Uses: racks-test — t0 nests a Drum Rack in an Instrument Rack, t1 nests Meld
 * two Instrument Racks deep. The multi-instrument shapes are built at runtime.
 * See e2e/live-sets/racks-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- ppal-read-track-instrument
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDevice,
  createTestDeviceAt,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { RACKS_TEST_PATH } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

/**
 * Read one track's `instrument` field.
 * @param trackIndex - 0-based track index
 * @returns The field, or undefined when the track has no instrument
 */
async function readInstrument(trackIndex: number): Promise<string | undefined> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-track",
    arguments: { path: `t${String(trackIndex)}` },
  });

  return parseToolResult<{ instrument?: string }>(result).instrument;
}

/**
 * The `instrument` field every track reports in a Live Set read.
 * @returns One entry per regular track, in track order
 */
async function readLiveSetInstruments(): Promise<(string | undefined)[]> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-live-set",
    arguments: { include: ["tracks"] },
  });

  return parseToolResult<{ tracks: { instrument?: string }[] }>(
    result,
  ).tracks.map((track) => track.instrument);
}

/**
 * A fresh MIDI track with no instrument on it yet.
 *
 * The guard is the point: Live applies the user's default track preset to
 * every new track, so on some machines a track arrives with devices already
 * on it. An instrument among them would be the one the field names.
 *
 * @returns The new track's index
 */
async function createBareMidiTrack(): Promise<number> {
  const trackIndex = await createMidiTrack(ctx.client!);

  expect(await readInstrument(trackIndex)).toBeUndefined();

  return trackIndex;
}

/**
 * Delete a track so an appended one doesn't shift later reads.
 * @param trackIndex - 0-based track index
 */
async function deleteTrack(trackIndex: number): Promise<void> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-track",
    arguments: { path: `t${String(trackIndex)}` },
  });

  await ctx.client!.callTool({
    name: "ppal-delete",
    arguments: {
      type: "track",
      id: parseToolResult<{ id: string }>(result).id,
    },
  });

  await sleep(100);
}

/**
 * Build an Instrument Rack on a new track, one instrument per chain.
 * @param instruments - Device names, in chain order
 * @returns The track index the rack landed on
 */
async function trackWithRackOf(instruments: string[]): Promise<number> {
  const trackIndex = await createBareMidiTrack();
  const rack = await createTestDeviceAt(
    ctx.client!,
    "Instrument Rack",
    `t${String(trackIndex)}`,
  );

  for (const [chainIndex, name] of instruments.entries()) {
    await createTestDevice(ctx.client!, name, `${rack}/c${String(chainIndex)}`);
  }

  return trackIndex;
}

describe("ppal-read-track instrument field", () => {
  describe("racks baked into the Set", () => {
    // t0: Instrument Rack "Outer" -> chain "Kit" -> Drum Rack "Kit".
    it("names a nested Drum Rack without opening it", async () => {
      expect(await readInstrument(0)).toBe("Instrument Rack (Drum Rack)");
    });

    // t1: Instrument Rack -> Instrument Rack -> Meld.
    it("reaches through nested Instrument Racks to the instrument", async () => {
      expect(await readInstrument(1)).toBe("Instrument Rack (Meld)");
    });

    it("reports the same field on read-live-set tracks", async () => {
      const instruments = await readLiveSetInstruments();

      expect(instruments[0]).toBe("Instrument Rack (Drum Rack)");
      expect(instruments[1]).toBe("Instrument Rack (Meld)");
    });
  });

  describe("racks built at runtime", () => {
    it("names a plain instrument as itself", async () => {
      const trackIndex = await createBareMidiTrack();

      await createTestDevice(ctx.client!, "Operator", `t${String(trackIndex)}`);

      expect(await readInstrument(trackIndex)).toBe("Operator");

      await deleteTrack(trackIndex);
    });

    it("lists distinct instruments in chain order, each one once", async () => {
      const trackIndex = await trackWithRackOf([
        "Operator",
        "Wavetable",
        "Operator",
      ]);

      expect(await readInstrument(trackIndex)).toBe(
        "Instrument Rack (Operator, Wavetable)",
      );

      await deleteTrack(trackIndex);
    });

    it("caps the list at four and counts the rest", async () => {
      const trackIndex = await trackWithRackOf([
        "Analog",
        "Drift",
        "Meld",
        "Operator",
        "Wavetable",
      ]);

      expect(await readInstrument(trackIndex)).toBe(
        "Instrument Rack (Analog, Drift, Meld, Operator, +1)",
      );

      await deleteTrack(trackIndex);
    });

    it("stays plain for a rack that plays nothing", async () => {
      const trackIndex = await createBareMidiTrack();

      await createTestDevice(
        ctx.client!,
        "Instrument Rack",
        `t${String(trackIndex)}`,
      );

      expect(await readInstrument(trackIndex)).toBe("Instrument Rack");

      await deleteTrack(trackIndex);
    });
  });
});

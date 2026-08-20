// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E regression test for `ppal-delete type:"drum-pad"`.
 *
 * The path resolver used to hand back the pad's *chain* instead of the DrumPad,
 * so `delete_all_chains` ran on a DrumChain (a silent no-op) and the tool
 * reported `deleted: true` for a pad that was untouched. This proves the pad is
 * really cleared, on a Drum Rack directly on a track and on one nested inside an
 * Instrument Rack chain.
 *
 * Run with: npm run e2e:mcp -- ppal-delete-drum-pad
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDeviceAt,
  createTwoPadDrumRack,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface DrumPadInfo {
  pitch: string;
}

interface DeleteResult {
  id: string;
  type: string;
  deleted: boolean;
}

describe("ppal-delete drum-pad", () => {
  it("clears a pad on a Drum Rack directly on the track", async () => {
    const t = await createMidiTrack(ctx.client!);
    const rack = await createTwoPadDrumRack(ctx.client!, `t${t}`);

    await expectPadCleared(rack.path);
  });

  it("clears a pad on a Drum Rack nested inside an Instrument Rack", async () => {
    const t = await createMidiTrack(ctx.client!);
    const wrapper = await createTestDeviceAt(
      ctx.client!,
      "Instrument Rack",
      `t${t}`,
    );
    const rack = await createTwoPadDrumRack(ctx.client!, `${wrapper}/c0`);

    await expectPadCleared(rack.path);
  });

  /**
   * Delete pad C1 from a two-pad rack and prove only C1 went.
   * @param rack - Producer Pal path to the Drum Rack
   */
  async function expectPadCleared(rack: string): Promise<void> {
    expect(await readPadPitches(rack)).toStrictEqual(["C1", "D1"]);

    const deleted = parseToolResult<DeleteResult>(
      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { type: "drum-pad", path: `${rack}/pC1` },
      }),
    );

    expect(deleted.deleted).toBe(true);

    await sleep(150);

    // C1 is gone; D1 untouched.
    expect(await readPadPitches(rack)).toStrictEqual(["D1"]);
  }

  /**
   * Read a drum rack's populated pad pitches.
   * @param path - Producer Pal device path to the drum rack
   * @returns Pitch names of pads that have chains
   */
  async function readPadPitches(path: string): Promise<string[]> {
    const device = parseToolResult<{ drumPads?: DrumPadInfo[] }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path, include: ["drum-pads"] },
      }),
    );

    return (device.drumPads ?? []).map((p) => p.pitch);
  }
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for reading nested racks.
 * Uses: racks-test — a Drum Rack inside an Instrument Rack chain, with another
 * Drum Rack on one of its pads. See e2e/live-sets/racks-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- ppal-read-device-nested-racks
 */
import { describe, expect, it } from "vitest";
import { parseToolResult, setupMcpTestContext } from "../mcp-test-helpers.ts";
import {
  type DeviceInfo,
  KIT,
  RACKS_TEST_PATH,
  readKitPads,
} from "./helpers/racks-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

const SUB_KIT = `${KIT}/pF1/c0/d0`;

/**
 * Read a device by path.
 * @param path - Producer Pal device path
 * @param args - Extra read-device arguments
 * @returns The device
 */
async function read(
  path: string,
  args: Record<string, unknown> = {},
): Promise<DeviceInfo> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-device",
    arguments: { path, ...args },
  });

  return parseToolResult<DeviceInfo>(result);
}

describe("read-device on nested racks", () => {
  it("finds a Drum Rack inside an Instrument Rack chain", async () => {
    const outer = await read("t0/d0");

    expect(outer.type).toBe("instrument-rack");

    const kit = await read(KIT);

    expect(kit.type).toBe("drum-rack");
    expect(kit.name).toBe("Kit");
  });

  it("finds a Drum Rack on a Drum Rack pad", async () => {
    const subKit = await read(SUB_KIT);

    expect(subKit.type).toBe("drum-rack");
    expect(subKit.name).toBe("Sub Kit");
  });

  // The path a read hands back has to resolve to the same object. It used to
  // come back with the pad spelled as a raw chain index.
  it("reports nested pad paths in pad notation and round-trips them", async () => {
    const kit = await readKitPads(ctx.client!);
    const subKit = kit.drumPads?.find((p) => p.name === "Sub Kit")?.chains?.[0]
      ?.devices?.[0];

    expect(subKit?.path).toBe(SUB_KIT);

    const hatChainPath = subKit?.drumPads?.[0]?.chains?.[0]?.path;

    expect(hatChainPath).toBe(`${SUB_KIT}/pC3/c0`);

    const hatChain = await read(hatChainPath!);

    expect(hatChain.name).toBe("Hat");
  });

  // A path can pass through two drum pads. The segments after the first pad's
  // device used to be dropped, answering with the rack instead of what was
  // asked for — under the requested path, so it looked correct.
  it("reads a device two drum pads deep", async () => {
    const simpler = await read(`${SUB_KIT}/pC3/c0/d0`);

    expect(simpler.type).toBe("instrument: Simpler");
    expect(simpler.name).toBe("synth-hat-open");

    const subKit = await read(SUB_KIT);

    expect(simpler.id).not.toBe(subKit.id);
  });

  it("keeps internal bookkeeping out of the response", async () => {
    const kit = await readKitPads(ctx.client!);
    const json = JSON.stringify(kit);

    expect(json).not.toContain("_processedDrumPads");
    expect(json).not.toContain("_processedChains");
    expect(json).not.toContain("_hasInstrument");
    expect(json).not.toContain("_inNote");
  });

  describe("drum map", () => {
    const EXPECTED_PADS = [
      "Kick",
      "Snare",
      "Clap",
      "Sub Kit",
      "Drum Sampler",
      "Sampler",
      "Multi-Simpler",
    ];

    it("reaches a Drum Rack nested in an Instrument Rack", async () => {
      const outer = await read("t0/d0", { include: ["drum-map"] });

      expect(Object.values(outer.drumMap ?? {})).toStrictEqual(EXPECTED_PADS);
      // Without this the pads look like they hang off t0/d0, and a pad path
      // built from the device that was read names nothing.
      expect(outer.drumRackPath).toBe(KIT);
    });

    it("lists a pad holding a nested Drum Rack", async () => {
      const kit = await read(KIT, { include: ["drum-map"] });

      expect(kit.drumMap?.F1).toBe("Sub Kit");
    });

    it("maps the nested rack's own pads", async () => {
      const subKit = await read(SUB_KIT, { include: ["drum-map"] });

      expect(subKit.drumMap).toStrictEqual({ C3: "Hat" });
      expect(subKit.drumRackPath).toBe(SUB_KIT);
    });

    // Live types a rack as an instrument whether or not it holds anything, so
    // an empty one used to be listed as a playable pad.
    it("leaves out a pad holding an empty rack", async () => {
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "Instrument Rack", path: `${KIT}/pB1` },
      });

      const kit = await read(KIT, { include: ["drum-map"] });

      expect(kit.drumMap?.B1).toBeUndefined();
      expect(Object.values(kit.drumMap ?? {})).toStrictEqual(EXPECTED_PADS);

      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { type: "drum-pad", path: `${KIT}/pB1` },
      });
    });
  });
});

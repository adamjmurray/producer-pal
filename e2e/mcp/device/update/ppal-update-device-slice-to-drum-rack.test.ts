// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for slicing a Simpler's sample and turning the slices into a Drum
 * Rack. The slice settings go through Max; the conversion needs the Producer
 * Pal remote script.
 *
 * Each test makes its own MIDI track, so they share one Live session.
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-update-device-slice-to-drum-rack
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  DRUM_LOOP_8BAR_FILE,
  DRUM_LOOP_FILE,
  parseToolResult,
  setupMcpTestContext,
  sleep,
  trackIndexFromPath,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers.ts";

interface Param {
  name: string;
  value?: unknown;
  ok?: boolean;
  detail?: string;
}

interface Entry {
  id: string;
  path: string;
  params?: Param[];
  actions?: Array<{ action: string; ok?: boolean; detail?: string }>;
}

interface DeviceRead {
  id: string;
  type: string;
  parameters?: Param[];
  drumPads?: Array<{ note?: string; name?: string }>;
}

describe.skipIf(!REMOTE_SCRIPT_E2E)("Simpler slices to Drum Rack", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext({ once: true });

  /**
   * Make a Simpler on a new MIDI track.
   * @returns The Simpler's id
   */
  async function createSimpler(): Promise<string> {
    const { path } = parseToolResult<{ path: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-track",
        arguments: { type: "midi" },
      }),
    );

    await sleep(100);

    return createTestDevice(
      ctx.client!,
      "Simpler",
      `t${trackIndexFromPath(path)}`,
    );
  }

  /**
   * Update a device and let Live settle.
   * @param id - The device
   * @param args - What to change
   * @returns Its result entry
   */
  async function update(
    id: string,
    args: Record<string, unknown>,
  ): Promise<Entry> {
    const entry = parseToolResult<Entry>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { id, ...args },
      }),
    );

    await sleep(150);

    return entry;
  }

  /**
   * Read a device.
   * @param id - The device
   * @param include - What to include
   * @returns The read
   */
  async function read(id: string, include: string[]): Promise<DeviceRead> {
    return parseToolResult<DeviceRead>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id, include },
      }),
    );
  }

  /**
   * One param's value from a read.
   * @param device - The read
   * @param name - The param
   * @returns Its value
   */
  function value(device: DeviceRead, name: string): unknown {
    return device.parameters?.find((param) => param.name === name)?.value;
  }

  it("slices by region and reads the slices in seconds", async () => {
    const id = await createSimpler();

    await update(id, { params: [{ name: "sample", value: DRUM_LOOP_FILE }] });
    await update(id, {
      params: [
        { name: "playbackMode", value: "slicing" },
        { name: "sliceBy", value: "region" },
        { name: "sliceRegions", value: "8" },
      ],
    });

    const device = await read(id, ["params"]);
    const slices = value(device, "slices") as number[];

    expect(value(device, "sliceBy")).toBe("region");
    expect(value(device, "sliceRegions")).toBe(8);
    expect(slices).toHaveLength(8);
    expect(slices[0]).toBe(0);
    // One bar at 108 BPM is about 2.22 s, so each eighth is about 0.278 s.
    expect(slices[1]).toBeCloseTo(0.278, 2);
  });

  it("setSlices switches to manual slices at the given seconds", async () => {
    const id = await createSimpler();

    await update(id, { params: [{ name: "sample", value: DRUM_LOOP_FILE }] });

    const entry = await update(id, {
      params: [{ name: "playbackMode", value: "slicing" }],
      actions: ["setSlices(0.5, 1)"],
    });
    const device = await read(id, ["params"]);

    expect(entry.actions).toStrictEqual([{ action: "setSlices(0.5, 1)" }]);
    expect(value(device, "sliceBy")).toBe("manual");
    expect(value(device, "slices")).toStrictEqual([0, 0.5, 1]);
  });

  it("converts a sliced Simpler to a Drum Rack with one pad per slice", async () => {
    const id = await createSimpler();

    await update(id, { params: [{ name: "sample", value: DRUM_LOOP_FILE }] });

    const entry = await update(id, {
      params: [
        { name: "playbackMode", value: "slicing" },
        { name: "sliceBy", value: "region" },
        { name: "sliceRegions", value: "4" },
      ],
      actions: ["sliceToDrumRack"],
    });

    expect(entry.actions).toStrictEqual([{ action: "sliceToDrumRack" }]);
    expect(entry.id).not.toBe(id);

    const rack = await read(entry.id, ["drum-pads"]);

    expect(rack.type).toContain("drum-rack");
    expect(rack.drumPads).toHaveLength(4);
  });

  // Live crashes if a Simpler's sample is replaced and converted in one
  // main-thread call. One tool call that does both must keep them apart.
  it("loads a sample and converts in the same call without crashing Live", async () => {
    const id = await createSimpler();
    const entry = await update(id, {
      params: [
        { name: "sample", value: DRUM_LOOP_8BAR_FILE },
        { name: "playbackMode", value: "slicing" },
        { name: "sliceBy", value: "region" },
        { name: "sliceRegions", value: "16" },
      ],
      actions: ["sliceToDrumRack"],
    });

    expect(entry.actions).toStrictEqual([{ action: "sliceToDrumRack" }]);

    const rack = await read(entry.id, ["drum-pads"]);

    expect(rack.drumPads).toHaveLength(16);
  });

  it.each(["sliceToDrumRack", "setSlices(1)"])(
    "refuses %s on a Simpler that isn't slicing, where it has no slices",
    async (action) => {
      const id = await createSimpler();

      await update(id, { params: [{ name: "sample", value: DRUM_LOOP_FILE }] });

      const result = await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { id, actions: [action] },
      });
      const device = await read(id, ["params"]);

      expect(JSON.stringify(result)).toContain("isn't in slicing mode");
      expect(device.id).toBe(id);
      expect(value(device, "slices")).toBeUndefined();
    },
  );
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-create-device tool
 * Creates devices in the Live Set - these modifications persist within the session.
 *
 * Uses: e2e-test-set
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- device/ppal-create-device
 */
import { describe, expect, it } from "vitest";
import {
  extractToolResultText,
  parseToolResult,
  parseToolResultWithWarnings,
  readDeviceCount,
  setupMcpTestContext,
  sleep,
  trackIndexFromPath,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-create-device", () => {
  /**
   * Create a device and parse the result.
   * @param deviceName - Device to create
   * @param path - Insertion path
   * @returns The new device
   */
  async function createDevice(
    deviceName: string,
    path: string,
  ): Promise<CreateDeviceResult> {
    return parseToolResult<CreateDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName, path },
      }),
    );
  }

  /**
   * A fresh track to build on, so the Set's own tracks stay intact.
   * @param type - Track type
   * @returns The new track's index
   */
  async function createTrack(type: "midi" | "audio"): Promise<number> {
    const track = parseToolResult<{ id: string; path: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-track",
        arguments: { type },
      }),
    );

    await sleep(100);

    return trackIndexFromPath(track.path);
  }

  /**
   * Read a device back by id.
   * @param id - Device id
   * @returns The device
   */
  async function readDevice(id: string): Promise<ReadDeviceResult> {
    await sleep(100);

    return parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id },
      }),
    );
  }

  it("lists the devices it can create when given no name", async () => {
    const list = parseToolResult<ListDevicesResult>(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: {},
      }),
    );

    expect(Array.isArray(list.instruments)).toBe(true);
    expect(list.audioEffects).toContain("Compressor");
    expect(list.midiEffects).toContain("Arpeggiator");
  });

  it("creates a device at position 0 on a track", async () => {
    // A default track preset may already have put devices here, so this is an
    // insert at 0 on some machines and the append fallback on others. Index 0
    // is the answer either way; the empty-rack-chain test covers the append on
    // a chain that is reliably empty.
    const trackIndex = await createTrack("midi");
    const eq = await createDevice("EQ Eight", `t${trackIndex}/d0`);

    expect(eq.id).toBeDefined();
    expect(eq.path).toBe(`t${trackIndex}/d0`);
  });

  it("appends an audio effect and a MIDI effect to a track", async () => {
    const comp = await createDevice("Compressor", "t0");

    expect(comp.path).toMatch(/^t0\/d\d+$/);
    expect((await readDevice(comp.id)).type).toContain("Compressor");

    const arp = await createDevice("Arpeggiator", "t0");

    expect((await readDevice(arp.id)).type).toContain("Arpeggiator");
  });

  it("creates a device on the master track", async () => {
    expect((await createDevice("Limiter", "mt")).id).toBeDefined();
  });

  it("refuses a device name Live doesn't have", async () => {
    const text = extractToolResultText(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "InvalidDeviceName123", path: "t0" },
      }),
    );

    expect(text).toContain("InvalidDeviceName123");
    expect(text.toLowerCase()).toContain("invalid");
  });

  it("refuses an audio effect before a track's instrument", async () => {
    // t1 has an instrument, so nothing audio can go in front of it
    const text = extractToolResultText(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "Compressor", path: "t1/d0" },
      }),
    );

    expect(text).toContain("could not insert");
    expect(text).toContain("Compressor");
    expect(text).toContain("t1/d0");
  });

  it("allows a MIDI effect before a track's instrument", async () => {
    const device = await createDevice("Arpeggiator", "t1/d0");

    expect(device.path).toBe("t1/d0");
  });

  it("appends and warns for a position past the end of the chain", async () => {
    // Live rejects an out-of-range insert position. Valid positions run
    // 0..count, so count + 1 is past the end wherever the track started —
    // hardcoding d1 only tests this on a machine whose default preset is empty.
    const trackIndex = await createTrack("midi");
    const startingDevices = await readDeviceCount(ctx.client!, trackIndex);
    const result = parseToolResultWithWarnings<CreateDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: {
          deviceName: "Compressor",
          path: `t${trackIndex}/d${startingDevices + 1}`,
        },
      }),
    );

    expect(result.data.path).toBe(`t${trackIndex}/d${startingDevices}`);
    expect(result.warnings.join("\n")).toContain(
      "past the end of the device chain",
    );
  });

  it("creates a device at position 0 in an empty rack chain", async () => {
    const trackIndex = await createTrack("audio");
    // An Audio Effect Rack arrives with one empty chain
    const rack = await createDevice("Audio Effect Rack", `t${trackIndex}`);

    await sleep(100);

    const chainDevice = await createDevice("Compressor", `${rack.path}/c0/d0`);

    expect(chainDevice.path).toBe(`${rack.path}/c0/d0`);
  });
});

interface ListDevicesResult {
  instruments: string[];
  midiEffects: string[];
  audioEffects: string[];
}

interface CreateDeviceResult {
  id: string;
  path: string;
}

interface ReadDeviceResult {
  id: string;
  type: string;
  name?: string;
}

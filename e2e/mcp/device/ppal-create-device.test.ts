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
import { createLayeredPad } from "./drum/drum-pad-test-helpers.ts";

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

  /**
   * Read a device back by path, to check the path a result handed out works.
   * @param path - Producer Pal path to the device
   * @returns The device
   */
  async function readDeviceAt(path: string): Promise<ReadDeviceResult> {
    await sleep(100);

    return parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path },
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

  // Aiming two devices at d1 and d2 used to land both at d1 and d2 and push
  // the two originals past them, so the second entry never went where it was
  // named. Refused up front now, before either one is created.
  it("refuses a path list spelled through its own insert", async () => {
    const trackIndex = await createTrack("midi");

    await createDevice("Compressor", `t${trackIndex}`);
    await createDevice("Reverb", `t${trackIndex}`);

    const before = await readDeviceCount(ctx.client!, trackIndex);
    const text = extractToolResultText(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: {
          deviceName: "Utility",
          path: `t${trackIndex}/d0,t${trackIndex}/d1`,
        },
      }),
    );

    expect(text).toContain("is spelled through");
    expect(await readDeviceCount(ctx.client!, trackIndex)).toBe(before);
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

  // A drum chain answers to a pad-relative path and a rack-relative one, and
  // once a pad is layered the two number the rack differently: D1 holds two
  // layers here, so pD1/c1 is the rack's chain 2 while the rack's chain 1 is
  // pD1/c0. A result that answered in the other spelling would hand the model
  // two numberings for one rack with nothing saying so.
  it("echoes the pad spelling a call used for a layered drum chain", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);
    const device = await createDevice("Chorus-Ensemble", `${rackPath}/pD1/c1`);

    expect(device.path).toMatch(new RegExp(`^${rackPath}/pD1/c1/d\\d+$`));
    expect((await readDeviceAt(device.path)).id).toBe(device.id);
  });

  it("echoes the rack-relative spelling, and keeps the two apart", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);
    const byRack = await createDevice("Chorus-Ensemble", `${rackPath}/c1`);

    expect(byRack.path).toMatch(new RegExp(`^${rackPath}/c1/d\\d+$`));

    const byPad = await createDevice("Chorus-Ensemble", `${rackPath}/pD1/c1`);

    // Rack chain 1 is D1's first layer; pD1/c1 is its second.
    expect(byPad.id).not.toBe(byRack.id);
    expect(byPad.path).toContain(`${rackPath}/pD1/c1/`);
    expect((await readDeviceAt(byRack.path)).id).toBe(byRack.id);
    expect((await readDeviceAt(byPad.path)).id).toBe(byPad.id);
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

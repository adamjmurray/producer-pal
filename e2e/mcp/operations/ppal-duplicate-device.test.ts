// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for `ppal-duplicate type="device"`.
 *
 * With the remote script, Live copies a device itself (the copy keeps its
 * name, parameters and rack chains) and the call moves it on. Instruments are
 * the exception: Live refuses them, so they still go through a temp track.
 * Only real Live shows what the copy keeps and that no temp track is left.
 *
 * Needs the Producer Pal remote script running.
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-device
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDeviceAt,
  createTwoPadDrumRack,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  readDeviceCount,
  readIdAtPath,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { AUDIO_TRACK, FX_BUS_TRACK } from "../e2e-test-set.ts";
import { readTrackCount } from "../device/helpers/track-count-test-helpers.ts";

const ctx = setupMcpTestContext();

/** t11 "PPAL": the track holding the Producer Pal device, at d0. */
const PRODUCER_PAL_TRACK = 11;

interface DeviceEntry {
  id: string;
  path?: string;
  ok?: false;
  detail?: string;
}

interface DeviceRead {
  id: string;
  type: string;
  name?: string;
  path?: string;
  chains?: { devices?: { id: string; type: string; name?: string }[] }[];
}

/**
 * Wrap a device in an Audio Effect Rack.
 * @param path - The device's path
 * @returns The rack's path
 */
async function wrapInRack(path: string): Promise<string> {
  const wrapped = parseToolResult<{ path: string }>(
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path, wrapInRack: true },
    }),
  );

  await sleep(150);

  return wrapped.path;
}

/**
 * Duplicate a device.
 * @param args - The duplicate call's args beyond `type`
 * @returns The copy's entry
 */
async function duplicateDevice(
  args: Record<string, unknown>,
): Promise<DeviceEntry> {
  const entry = parseToolResult<DeviceEntry>(
    await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "device", ...args },
    }),
  );

  await sleep(150);

  return entry;
}

/**
 * Read a device.
 * @param path - The device's path
 * @returns What the device is, with its chains one level down
 */
async function readDevice(path: string): Promise<DeviceRead> {
  return parseToolResult<DeviceRead>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path, include: ["chains"], maxDepth: 1 },
    }),
  );
}

describe("ppal-duplicate type=device through the remote script", () => {
  it("copies an effect from inside a rack chain onto another track", async () => {
    const compressor = await createTestDeviceAt(
      ctx.client!,
      "Compressor",
      `t${AUDIO_TRACK}`,
    );
    const rack = await wrapInRack(compressor);
    const inner = `${rack}/c0/d0`;
    const target = FX_BUS_TRACK;
    const targetCount = await readDeviceCount(ctx.client!, target);
    const tracksBefore = await readTrackCount(ctx.client!);

    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: inner, name: "My Comp" },
    });

    const copy = await duplicateDevice({ path: inner, toPath: `t${target}` });

    expect(copy.ok).toBeUndefined();
    expect(copy.detail).toBeUndefined();
    expect(copy.path).toMatch(new RegExp(`^t${target}/d\\d+$`));

    const copied = await readDevice(copy.path!);

    expect(copied.type).toContain("Compressor");
    expect(copied.name).toBe("My Comp");

    // The original stays in its chain, and no temp track is left over.
    expect((await readDevice(inner)).name).toBe("My Comp");
    expect((await readDevice(rack)).chains?.[0]?.devices).toHaveLength(1);
    expect(await readDeviceCount(ctx.client!, target)).toBe(targetCount + 1);
    expect(await readTrackCount(ctx.client!)).toBe(tracksBefore);
  });

  it("copies an effect rack with its chains, right after the original", async () => {
    const compressor = await createTestDeviceAt(
      ctx.client!,
      "Compressor",
      `t${AUDIO_TRACK}`,
    );
    const rack = await wrapInRack(compressor);
    const countBefore = await readDeviceCount(ctx.client!, AUDIO_TRACK);
    const copy = await duplicateDevice({ path: rack });
    const rackIndex = Number(rack.split("/d").at(-1));

    expect(copy.ok).toBeUndefined();
    expect(copy.path).toBe(`t${AUDIO_TRACK}/d${rackIndex + 1}`);
    expect(await readDeviceCount(ctx.client!, AUDIO_TRACK)).toBe(
      countBefore + 1,
    );

    const copied = await readDevice(copy.path!);

    expect(copied.chains).toHaveLength(1);
    expect(copied.chains?.[0]?.devices?.[0]?.type).toContain("Compressor");
  });

  // The temp-track route can't reach return tracks, so this only works with the
  // remote script.
  it("copies a device on a return track", async () => {
    const reverb = await createTestDeviceAt(ctx.client!, "Reverb", "rt0");
    const index = Number(reverb.split("/d").at(-1));
    const copy = await duplicateDevice({ path: reverb });

    expect(copy.ok).toBeUndefined();
    expect(copy.path).toBe(`rt0/d${index + 1}`);
    expect((await readDevice(copy.path!)).type).toContain("Reverb");
  });

  it("copies a device from a drum pad's chain onto another track", async () => {
    const rack = (
      await createTwoPadDrumRack(
        ctx.client!,
        `t${await createMidiTrack(ctx.client!)}`,
      )
    ).path;
    const reverb = await createTestDeviceAt(
      ctx.client!,
      "Reverb",
      `${rack}/pC1`,
    );
    const countBefore = await readDeviceCount(ctx.client!, FX_BUS_TRACK);
    const copy = await duplicateDevice({
      path: reverb,
      toPath: `t${FX_BUS_TRACK}`,
    });

    expect(copy.ok).toBeUndefined();
    expect(copy.path).toMatch(new RegExp(`^t${FX_BUS_TRACK}/d\\d+$`));
    expect((await readDevice(copy.path!)).type).toContain("Reverb");
    expect((await readDevice(reverb)).type).toContain("Reverb");
    expect(await readDeviceCount(ctx.client!, FX_BUS_TRACK)).toBe(
      countBefore + 1,
    );
  });

  // The temp-track route spawned a second Producer Pal beside the first, and
  // could take a whole rack with it when it cleaned up.
  it("copies a device on the track that holds Producer Pal", async () => {
    const arpeggiator = await createTestDeviceAt(
      ctx.client!,
      "Arpeggiator",
      `t${PRODUCER_PAL_TRACK}`,
    );
    const countBefore = await readDeviceCount(ctx.client!, PRODUCER_PAL_TRACK);
    const copy = await duplicateDevice({ path: arpeggiator });

    expect(copy.ok).toBeUndefined();
    expect(copy.path).toMatch(new RegExp(`^t${PRODUCER_PAL_TRACK}/d\\d+$`));
    expect((await readDevice(copy.path!)).type).toContain("Arpeggiator");
    expect(await readDeviceCount(ctx.client!, PRODUCER_PAL_TRACK)).toBe(
      countBefore + 1,
    );
    // Producer Pal is still there, once.
    const track = parseToolResult<{ devices?: { name: string }[] }>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { path: `t${PRODUCER_PAL_TRACK}`, include: ["devices"] },
      }),
    );

    expect(
      track.devices?.filter((device) => device.name === "Producer_Pal"),
    ).toHaveLength(1);
  });

  it("still refuses to copy the Producer Pal device", async () => {
    const id = await readIdAtPath(
      ctx.client!,
      "ppal-read-device",
      `t${PRODUCER_PAL_TRACK}/d0`,
    );
    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "device", id },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "cannot duplicate the Producer Pal device",
    );
  });

  // Live refuses instruments, so these take the temp-track route.
  it("copies an instrument, which Live won't copy itself", async () => {
    const operator = await createTestDeviceAt(
      ctx.client!,
      "Operator",
      `t${await createMidiTrack(ctx.client!)}`,
    );
    // A track takes one instrument, so the copy goes to an empty track.
    const target = await createMidiTrack(ctx.client!);
    const tracksBefore = await readTrackCount(ctx.client!);
    const copy = await duplicateDevice({
      path: operator,
      toPath: `t${target}/d0`,
    });

    expect(copy.ok).toBeUndefined();
    expect(copy.path).toBeDefined();
    expect((await readDevice(copy.path!)).type).toContain("Operator");
    expect(await readTrackCount(ctx.client!)).toBe(tracksBefore);
  });
});

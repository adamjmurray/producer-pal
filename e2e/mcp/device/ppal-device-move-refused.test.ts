// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for where a device move lands, or doesn't.
 *
 * A track or chain holds at most one instrument, and Live drops a move that
 * would add a second without saying so. Both tools used to report success: the
 * move returned the device's id as if it had gone somewhere, and the duplicate
 * returned the id of a copy still sitting on its temp track, which the cleanup
 * then deleted. Both now refuse the lone destination they were given.
 *
 * The `d+` suite below is the other half: only real Live says where an append
 * lands, since a default track preset may already have put devices there. The
 * last suite pairs a batch's destinations with its devices, which needs the
 * same live read.
 *
 * Run with: npm run e2e:mcp -- ppal-device-move-refused
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDevice,
  getToolErrorMessage,
  getToolWarnings,
  isToolError,
  parseToolResult,
  readDeviceCount,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

/**
 * Two fresh MIDI tracks, each holding an instrument. Reports the device counts
 * they start with: a default track preset can add devices of its own, so what
 * "unchanged" means is per-machine.
 * @returns The tracks' indices, the id of the first one's instrument, and the
 *   device count of each track before anything is moved
 */
async function twoInstrumentTracks(): Promise<{
  from: number;
  to: number;
  deviceId: string;
  before: [number, number];
}> {
  const from = await createMidiTrack(ctx.client!);
  const deviceId = await createTestDevice(ctx.client!, "Operator", `t${from}`);
  const to = await createMidiTrack(ctx.client!);

  await createTestDevice(ctx.client!, "Operator", `t${to}`);
  await sleep(150);

  return { from, to, deviceId, before: await deviceCounts(from, to) };
}

/**
 * Read both tracks' device counts.
 * @param from - Track the move starts on
 * @param to - Track the move aims at
 * @returns Each track's device count
 */
async function deviceCounts(
  from: number,
  to: number,
): Promise<[number, number]> {
  return [
    await readDeviceCount(ctx.client!, from),
    await readDeviceCount(ctx.client!, to),
  ];
}

/**
 * Ask update-device to move the first track's instrument onto the second,
 * which Live drops, and check both tracks are as they were afterwards.
 * @param extra - Anything else to ask of the device alongside the move
 * @returns The raw tool result
 */
async function moveInstrumentOntoInstrument(
  extra: Record<string, unknown> = {},
): Promise<unknown> {
  const { from, to, deviceId, before } = await twoInstrumentTracks();

  const result = await ctx.client!.callTool({
    name: "ppal-update-device",
    arguments: { id: deviceId, toPath: `t${to}`, ...extra },
  });

  await sleep(200);

  // Both tracks are as they were: nothing arrived, nothing left.
  expect(await deviceCounts(from, to)).toStrictEqual(before);

  return result;
}

describe("a device move Live refuses", () => {
  it("refuses instead of reporting the move as done", async () => {
    const result = await moveInstrumentOntoInstrument();

    // The move was the whole call, so nothing landed on the lone device.
    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("already has an instrument");
    expect(getToolWarnings(result)).toStrictEqual([]);
  });

  it("refuses a duplicate rather than naming a copy that no longer exists", async () => {
    const { from, to, deviceId, before } = await twoInstrumentTracks();

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "device", id: deviceId, toPath: `t${to}` },
    });

    // One destination and no copy, so the reason comes back as the error.
    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `could not be moved to "t${to}"`,
    );

    await sleep(200);

    // And the temp track duplicate_track parks next to the source is gone.
    expect(await deviceCounts(from, to)).toStrictEqual(before);
  });

  it("says on the entry that a name landed but the move did not", async () => {
    const result = await moveInstrumentOntoInstrument({ name: "Still Here" });

    // The rename landed, so the device keeps a normal entry and no `ok`.
    const entry = parseToolResult<{ id: string; reason?: string }>(result);

    expect(entry.reason).toContain("already has an instrument");
    expect(entry).not.toHaveProperty("ok");
    expect(getToolWarnings(result)).toStrictEqual([]);
  });

  it("refuses a toPath naming an index past the end of the container", async () => {
    // Live takes 0 through the container's device count and ignores anything
    // higher without a word. Within one container the arrival check cannot see
    // it either, because the device is already in the list that check reads.
    const track = await createMidiTrack(ctx.client!);

    await createTestDevice(ctx.client!, "Operator", `t${track}`);

    const count = await readDeviceCount(ctx.client!, track);
    const pastTheEnd = `t${track}/d${count + 5}`;

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${track}/d0`, toPath: pastTheEnd },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `"${pastTheEnd}" is past the end`,
    );
    expect(getToolWarnings(result)).toStrictEqual([]);

    await sleep(200);

    expect(await readDeviceCount(ctx.client!, track)).toBe(count);
  });

  it("takes the index equal to the device count, which appends", async () => {
    const from = await createMidiTrack(ctx.client!);
    const to = await createMidiTrack(ctx.client!);
    const deviceId = await createTestDevice(ctx.client!, "Reverb", `t${from}`);
    const count = await readDeviceCount(ctx.client!, to);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, toPath: `t${to}/d${count}` },
    });

    expect(getToolWarnings(result)).not.toContainEqual(
      expect.stringContaining("past the end"),
    );

    await sleep(200);

    expect(await readDeviceCount(ctx.client!, to)).toBe(count + 1);
  });
});

// A bare container appends too, so both spellings land after the last device.
describe.each([
  ["d+", "/d+"],
  ["a bare container", ""],
])("%s as a device destination", (_label, suffix) => {
  it("moves a device to the end of a track", async () => {
    const { deviceId, to, before } = await deviceAndBusyDestination("Reverb");

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: deviceId, toPath: `t${to}${suffix}` },
    });

    expect(getToolWarnings(result)).not.toContainEqual(
      expect.stringContaining("past the end"),
    );
    await expectAppendedLast(result, to, before);
  });

  it("copies a device to the end of a track", async () => {
    const { deviceId, to, before } =
      await deviceAndBusyDestination("Compressor");

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "device", id: deviceId, toPath: `t${to}${suffix}` },
    });

    expect(isToolError(result)).toBe(false);
    await expectAppendedLast(result, to, before);
  });
});

/**
 * A device on a fresh track, with a fresh destination track that already holds
 * one, so the end of the destination is not also index 0.
 * @param deviceName - The device to put on the source track
 * @returns The device's id, the destination track, and its device count
 */
async function deviceAndBusyDestination(
  deviceName: string,
): Promise<{ deviceId: string; to: number; before: number }> {
  const from = await createMidiTrack(ctx.client!);
  const to = await createMidiTrack(ctx.client!);
  const deviceId = await createTestDevice(ctx.client!, deviceName, `t${from}`);

  await createTestDevice(ctx.client!, "Utility", `t${to}`);

  return { deviceId, to, before: await readDeviceCount(ctx.client!, to) };
}

/**
 * Check a write landed in the destination's last slot.
 * @param result - What the write reported
 * @param to - The destination track index
 * @param before - The destination's device count before the write
 */
async function expectAppendedLast(
  result: unknown,
  to: number,
  before: number,
): Promise<void> {
  // The append lands at the index the count named, so the device is last.
  expect(parseToolResult<{ path: string }>(result).path).toBe(
    `t${to}/d${before}`,
  );

  await sleep(200);

  expect(await readDeviceCount(ctx.client!, to)).toBe(before + 1);
}

interface MovedDevice {
  id: string;
  path: string;
}

/**
 * A fresh track holding two audio effects, for a batch to move.
 * @returns The track index and its two device ids, in device order
 */
async function twoDevices(): Promise<{ track: number; ids: string[] }> {
  const track = await createMidiTrack(ctx.client!);
  const first = await createTestDevice(ctx.client!, "Reverb", `t${track}`);
  const second = await createTestDevice(ctx.client!, "Utility", `t${track}`);

  await sleep(150);

  return { track, ids: [first, second] };
}

// A device slot holds one object, so a destination never covers several
// devices: they pair 1:1, and a mismatch is refused before anything moves.
describe("toPath paired with the devices a move names", () => {
  it("sends each device to the destination at its own position", async () => {
    const { ids } = await twoDevices();
    const left = await createMidiTrack(ctx.client!);
    const right = await createMidiTrack(ctx.client!);
    const leftBefore = await readDeviceCount(ctx.client!, left);
    const rightBefore = await readDeviceCount(ctx.client!, right);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: ids.join(","), toPath: `t${left}/d+,t${right}/d+` },
    });

    expect(parseToolResult<MovedDevice[]>(result)).toStrictEqual([
      { id: ids[0], path: `t${left}/d${leftBefore}` },
      { id: ids[1], path: `t${right}/d${rightBefore}` },
    ]);

    await sleep(200);

    expect(await readDeviceCount(ctx.client!, left)).toBe(leftBefore + 1);
    expect(await readDeviceCount(ctx.client!, right)).toBe(rightBefore + 1);
  });

  // Live inserts rather than overwrites, so a repeat costs nothing: the second
  // append lands after the first.
  it("appends both devices for a repeated d+ destination", async () => {
    const { ids } = await twoDevices();
    const to = await createMidiTrack(ctx.client!);
    const before = await readDeviceCount(ctx.client!, to);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: ids.join(","), toPath: `t${to}/d+,t${to}/d+` },
    });

    expect(parseToolResult<MovedDevice[]>(result)).toStrictEqual([
      { id: ids[0], path: `t${to}/d${before}` },
      { id: ids[1], path: `t${to}/d${before + 1}` },
    ]);

    await sleep(200);

    expect(await readDeviceCount(ctx.client!, to)).toBe(before + 2);
  });

  it("refuses one destination for two devices and moves nothing", async () => {
    const { track, ids } = await twoDevices();
    const to = await createMidiTrack(ctx.client!);
    const sourceBefore = await readDeviceCount(ctx.client!, track);
    const destinationBefore = await readDeviceCount(ctx.client!, to);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: ids.join(","), toPath: `t${to}/d+` },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "toPath names 1 destination but the call names 2 targets",
    );

    await sleep(200);

    expect(await readDeviceCount(ctx.client!, track)).toBe(sourceBefore);
    expect(await readDeviceCount(ctx.client!, to)).toBe(destinationBefore);
  });
});

// A chain belongs to its rack: moving one means moving the devices inside it.
// The refusal used to be a warning beside an {id, path} that read as a move.
describe("a rack chain a call asks to move", () => {
  /**
   * Wrap a device in a rack and report the rack and its only chain.
   * @returns The rack's id and its chain's id
   */
  async function rackAndChain(): Promise<{ rackId: string; chainId: string }> {
    const track = await createMidiTrack(ctx.client!);
    const deviceId = await createTestDevice(ctx.client!, "Reverb", `t${track}`);
    const rackId = parseToolResult<{ id: string }>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { id: deviceId, wrapInRack: true },
      }),
    ).id;

    await sleep(200);

    const rack = parseToolResult<{ chains?: Array<{ id: string }> }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id: rackId, include: ["chains"], maxDepth: 1 },
      }),
    );

    return { rackId, chainId: rack.chains![0]!.id };
  }

  it("refuses it, saying chain rather than Live's class name", async () => {
    const { chainId } = await rackAndChain();

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: chainId, toPath: "t0" },
    });

    // The move was the whole call, so the lone chain throws.
    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "a chain cannot be moved; move its devices instead",
    );
    expect(getToolWarnings(result)).toStrictEqual([]);
  });

  it("keeps its entry when a rename landed beside the refused move", async () => {
    const { rackId, chainId } = await rackAndChain();

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: chainId, toPath: "t0", name: "Renamed" },
    });
    const entry = parseToolResult<{ id: string; reason?: string }>(result);

    expect(entry.id).toBe(chainId);
    expect(entry.reason).toBe(
      "a chain cannot be moved; move its devices instead",
    );
    expect(getToolWarnings(result)).toStrictEqual([]);

    await sleep(200);

    const rack = parseToolResult<{ chains?: Array<{ name?: string }> }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id: rackId, include: ["chains"], maxDepth: 1 },
      }),
    );

    expect(rack.chains![0]!.name).toBe("Renamed");
  });
});

describe('"d+" as the device to update', () => {
  // A move needs a device that exists, so the append marker names nothing to
  // move — and the refusal has to say which tools do take it.
  it("refuses d+ as the device to update", async () => {
    const track = await createMidiTrack(ctx.client!);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${track}/d+`, name: "Nope" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      '"d+" appends a device, which only ppal-create-device, ppal-duplicate and ppal-update-device do',
    );
  });
});

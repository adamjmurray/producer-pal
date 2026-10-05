// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E test for duplicating the track that holds Producer Pal when the device
 * sits inside a rack's chain. The copy must lose only Producer Pal, not the
 * whole rack around it.
 *
 * Producer Pal is moved into the chain at runtime with the Live API tool, then
 * put back at the end. Needs a build with the Live API tool (build:debug).
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-host-track-in-rack
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  createTestDeviceAt,
  parseToolResult,
  readIdAtPath,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext();

/** The device name Live gives Producer Pal. */
const PRODUCER_PAL = "Producer_Pal";
const ARPEGGIATOR = "midi-effect: Arpeggiator";

interface TrackRead {
  id: string;
  path: string;
  hasProducerPalDevice?: boolean;
  devices?: { id: string; type: string; name?: string }[];
}

interface RackRead {
  chains?: { id: string; devices?: { name?: string; type: string }[] }[];
}

interface DuplicateEntry {
  id: string;
  path: string;
  detail?: string;
}

/**
 * The track holding Producer Pal, found by asking rather than by index.
 * @returns The track's index
 */
async function findHostTrackIndex(): Promise<number> {
  const liveSet = parseToolResult<{ tracks: TrackRead[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    }),
  );
  const host = liveSet.tracks.find((track) => track.hasProducerPalDevice);

  if (host == null) {
    throw new Error("no track reports holding the Producer Pal device");
  }

  return Number(host.path.replace(/^t/, ""));
}

/**
 * Read a track with its top-level devices.
 * @param path - The track's path
 * @returns The track
 */
async function readTrack(path: string): Promise<TrackRead> {
  return parseToolResult<TrackRead>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path, include: ["devices"] },
    }),
  );
}

/**
 * Read a rack with its chains and each chain's devices.
 * @param path - The rack's path
 * @returns The rack
 */
async function readRack(path: string): Promise<RackRead> {
  return parseToolResult<RackRead>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path, include: ["chains"], maxDepth: 1 },
    }),
  );
}

/**
 * Move a device with Live's own call, since no tool moves Producer Pal.
 * @param deviceId - The device to move
 * @param containerId - The track or chain to move it into
 * @param index - Where in the container it goes
 */
async function moveDevice(
  deviceId: string,
  containerId: string,
  index: number,
): Promise<void> {
  await ctx.client!.callTool({
    name: "ppal-live-api",
    arguments: {
      path: "live_set",
      operations: [
        {
          type: "call",
          method: "move_device",
          args: [`id ${deviceId}`, `id ${containerId}`, index],
        },
      ],
    },
  });
  await sleep(300);
}

describe("ppal-duplicate type=track on the host track", () => {
  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
  });

  it("keeps the rack and its other device when Producer Pal sits in a chain", async () => {
    const host = `t${await findHostTrackIndex()}`;
    const hostBefore = await readTrack(host);
    const producerPal = hostBefore.devices?.find(
      (device) => device.name === PRODUCER_PAL,
    );

    expect(producerPal).toBeDefined();

    const rackPath = await createTestDeviceAt(
      ctx.client!,
      "MIDI Effect Rack",
      host,
    );
    const rackId = await readIdAtPath(
      ctx.client!,
      "ppal-read-device",
      rackPath,
    );

    await createTestDeviceAt(ctx.client!, "Arpeggiator", `${rackPath}/c+`);

    const chainId = (await readRack(rackPath)).chains?.[0]?.id as string;

    await moveDevice(producerPal!.id, chainId, 0);

    try {
      const source = await readTrack(host);
      const rackIndex = source.devices!.findIndex(
        (device) => device.id === rackId,
      );

      // Producer Pal left the track's own list, so the rack moved up a slot.
      const movedRack = `${host}/d${rackIndex}`;

      expect(rackIndex).toBeGreaterThanOrEqual(0);
      expect(
        source.devices?.some((device) => device.name === PRODUCER_PAL),
      ).toBe(false);
      // It went to the front of the rack's chain, ahead of the Arpeggiator.
      expect(
        (await readRack(movedRack)).chains?.[0]?.devices?.map(
          (d) => d.name ?? d.type,
        ),
      ).toStrictEqual([PRODUCER_PAL, ARPEGGIATOR]);

      const copy = parseToolResult<DuplicateEntry>(
        await ctx.client!.callTool({
          name: "ppal-duplicate",
          arguments: { type: "track", id: source.id },
        }),
      );

      await sleep(300);

      expect(copy.detail).toBe("the Producer Pal device was not copied");

      // The copy keeps the track's devices, and its rack keeps the Arpeggiator.
      const copied = await readTrack(copy.path);

      expect(copied.devices?.map((device) => device.type)).toStrictEqual(
        source.devices?.map((device) => device.type),
      );
      expect(
        (
          await readRack(`${copy.path}/d${rackIndex}`)
        ).chains?.[0]?.devices?.map((d) => d.name ?? d.type),
      ).toStrictEqual([ARPEGGIATOR]);

      // The original still holds Producer Pal, in the same place.
      expect(
        (await readRack(movedRack)).chains?.[0]?.devices?.map(
          (d) => d.name ?? d.type,
        ),
      ).toStrictEqual([PRODUCER_PAL, ARPEGGIATOR]);
    } finally {
      await moveDevice(producerPal!.id, hostBefore.id, 0);
    }
  });
});

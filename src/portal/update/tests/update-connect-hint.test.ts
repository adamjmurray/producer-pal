// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import {
  hintDeadline,
  hintFor,
  UPDATE_HINT_MS,
  withUpdateHint,
} from "../update-connect-hint.ts";
import { DOWN, fakeDevice, OLD } from "./update-test-helpers.ts";

const CONNECT = {
  name: "ppal-connect",
  manageOffered: true,
  remoteHost: null,
};
const UPDATE_URL =
  "https://producer-pal.org/installation/upgrading#update-by-hand";
const BY_HAND = `Tell the user to update the Producer Pal device by hand: ${UPDATE_URL}`;
const IN_PLACE =
  'Ask the user, then call ppal-manage action "update-producer-pal" to update it in place.';

/** @returns A successful ppal-connect result */
function connected(): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: "text", text: "connected" }] };
}

/**
 * A device that has answered once, as the bridge's connection has by the time a
 * tool call succeeds.
 * @param answers - What successive connects find
 * @returns The device
 */
async function connectedDevice(
  ...answers: Parameters<typeof fakeDevice>
): Promise<ReturnType<typeof fakeDevice>> {
  const device = fakeDevice(...answers);

  await device.connect();

  return device;
}

describe("withUpdateHint", () => {
  it("adds how to update in place when the device has ppal-manage", async () => {
    const device = await connectedDevice("2.5.0-rc1");
    const result = await withUpdateHint(connected(), CONNECT, device);

    expect(result.content).toStrictEqual([
      { type: "text", text: "connected" },
      {
        type: "text",
        text: `The Producer Pal device (2.5.0-rc1) is older than this connector (${VERSION}). ${IN_PLACE}`,
      },
    ]);
  });

  it("adds the hint after the last block of a version check, which is a ppal-connect too", async () => {
    const check = {
      content: [
        { type: "text", text: "connected" },
        { type: "text", text: "remoteScript: running" },
      ],
    };
    const result = await withUpdateHint(
      check,
      CONNECT,
      await connectedDevice("2.5.0-rc1"),
    );

    expect(result.content).toHaveLength(3);
    expect(result.content[2]?.text).toContain("is older than this connector");
  });

  it("sends the user to the by-hand guide for a device older than ppal-manage", async () => {
    const result = await withUpdateHint(
      connected(),
      CONNECT,
      await connectedDevice(OLD, OLD),
    );

    expect(result.content[1]?.text).toBe(
      `The Producer Pal device (${OLD}) is older than this connector (${VERSION}). ${BY_HAND}`,
    );
  });

  it("sends the user to the by-hand guide when ppal-manage isn't offered", async () => {
    const result = await withUpdateHint(
      connected(),
      { ...CONNECT, manageOffered: false },
      await connectedDevice("2.5.0-rc1"),
    );

    expect(result.content[1]?.text).toBe(
      `The Producer Pal device (2.5.0-rc1) is older than this connector (${VERSION}). ${BY_HAND}`,
    );
  });

  it("sends the user to update by hand on the other computer when the device is on one", async () => {
    // The portal refuses update-producer-pal there, so it isn't offered.
    const result = await withUpdateHint(
      connected(),
      { ...CONNECT, remoteHost: "studio-mac.local:3350" },
      await connectedDevice("2.5.0-rc1"),
    );

    expect(result.content[1]?.text).toBe(
      `The Producer Pal device (2.5.0-rc1) is older than this connector (${VERSION}). Tell the user to update the Producer Pal device by hand on the computer running Live (studio-mac.local:3350): ${UPDATE_URL}`,
    );
    expect(result.content[1]?.text).not.toContain("ppal-manage");
  });

  it.each([
    ["ppal-manage is offered", true, "2.5.0-rc1"],
    ["ppal-manage isn't offered", false, "2.5.0-rc1"],
    ["the device predates ppal-manage", true, OLD],
  ])(
    "adds nothing in small-model mode, whether %s",
    async (_why, manageOffered, version) => {
      const device = await connectedDevice(version, version);

      device.smallModelMode.mockResolvedValue(true);

      const result = await withUpdateHint(
        connected(),
        { ...CONNECT, manageOffered },
        device,
      );

      expect(result.content).toHaveLength(1);
    },
  );

  it("asks the device afresh before saying so", async () => {
    const device = await connectedDevice(OLD, OLD);

    await withUpdateHint(connected(), CONNECT, device);

    expect(device.reset).toHaveBeenCalledTimes(1);
    expect(device.connect).toHaveBeenCalledTimes(2);
  });

  it("says nothing when the device turns out to have been updated since", async () => {
    const result = await withUpdateHint(
      connected(),
      CONNECT,
      await connectedDevice(OLD, VERSION),
    );

    expect(result.content).toHaveLength(1);
  });

  it.each([
    ["the same version", VERSION],
    ["a newer version", "99.0.0"],
    ["no version", undefined],
  ])("says nothing for a device with %s", async (_why, version) => {
    const device = await connectedDevice(version);
    const result = await withUpdateHint(connected(), CONNECT, device);

    expect(result.content).toHaveLength(1);
    expect(device.reset).not.toHaveBeenCalled();
  });

  it("says nothing when the device stops answering while it checks", async () => {
    const result = await withUpdateHint(
      connected(),
      CONNECT,
      await connectedDevice(OLD, DOWN),
    );

    expect(result.content).toHaveLength(1);
  });

  it("says nothing when the second look finds no version", async () => {
    const result = await withUpdateHint(
      connected(),
      CONNECT,
      await connectedDevice(OLD, undefined),
    );

    expect(result.content).toHaveLength(1);
  });

  it("leaves every other tool alone", async () => {
    const device = await connectedDevice(OLD);
    const result = await withUpdateHint(
      connected(),
      { ...CONNECT, name: "ppal-read-live-set" },
      device,
    );

    expect(result.content).toHaveLength(1);
    expect(device.reset).not.toHaveBeenCalled();
  });

  it("leaves a failed ppal-connect and one with no content alone", async () => {
    const device = await connectedDevice(OLD);
    const failed = { ...connected(), isError: true };
    const bare = { toolResult: "x" };

    expect(await withUpdateHint(failed, CONNECT, device)).toBe(failed);
    expect(await withUpdateHint(bare, CONNECT, device)).toBe(bare);
  });
});

describe("hintFor", () => {
  it("offers the in-place update only for a local device that has ppal-manage", () => {
    expect(hintFor("2.5.0-rc1", true, null)).toContain(IN_PLACE);
    expect(hintFor("2.5.0-rc1", true, "10.0.0.5:3350")).not.toContain(IN_PLACE);
    expect(hintFor("2.5.0-rc1", false, null)).not.toContain(IN_PLACE);
    expect(hintFor(OLD, true, null)).not.toContain(IN_PLACE);
  });
});

describe("hintDeadline", () => {
  const clock = { now: () => 1000 };

  it("allows the hint its own few seconds when the budget has more", () => {
    expect(hintDeadline(clock, 1000 + 50_000)).toBe(1000 + UPDATE_HINT_MS);
  });

  it("allows only what is left of the budget when that is less", () => {
    expect(hintDeadline(clock, 1000 + 2000)).toBe(3000);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { VERSION } from "#src/shared/config.ts";
import { withUpdateHint } from "../update-connect-hint.ts";
import { DOWN, fakeDevice, OLD } from "./update-test-helpers.ts";

const CONNECT = { name: "ppal-connect", manageOffered: true };

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
  it("adds how to update when the device is older than the portal", async () => {
    const device = await connectedDevice(OLD);
    const result = await withUpdateHint(connected(), CONNECT, device);

    expect(result.content).toStrictEqual([
      { type: "text", text: "connected" },
      {
        type: "text",
        text: `The Producer Pal device (${OLD}) is older than this connector (${VERSION}). Ask the user, then call ppal-manage action "update-producer-pal" to update it in place.`,
      },
    ]);
  });

  it("tells the user to update the device when ppal-manage isn't offered", async () => {
    const result = await withUpdateHint(
      connected(),
      { name: "ppal-connect", manageOffered: false },
      await connectedDevice(OLD),
    );

    expect(result.content[1]?.text).toBe(
      `The Producer Pal device (${OLD}) is older than this connector (${VERSION}). Tell the user to update the Producer Pal device.`,
    );
  });

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
      { name: "ppal-read-live-set", manageOffered: true },
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

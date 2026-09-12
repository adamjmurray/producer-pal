// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { moveDeviceToPath } from "../../helpers/move-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { mockWorkingDeviceMoves } from "../update-device-test-helpers.ts";

describe("moveDeviceToPath", () => {
  let device: RegisteredMockObject;

  beforeEach(() => {
    device = registerMockObject("device-0", {
      path: livePath.track(0).device(0),
      type: "Device",
    });
  });

  it("blames toPath, the param every caller took the path from", () => {
    expect(moveDeviceToPath(LiveAPI.from(device.path), "x9/d0")).toStrictEqual({
      outcome: "unresolvable",
    });
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        'device not moved: invalid toPath "x9/d0" - "x9" is not a track or scene',
      ),
    );
  });

  it("warns and skips a path that names no place a device can go", () => {
    // Resolution throws for these; a caller moving several ids at once would
    // lose the whole batch over one bad destination.
    mockNonExistentObjects();

    expect(
      moveDeviceToPath(LiveAPI.from(device.path), "t99/d0/c0"),
    ).toStrictEqual({ outcome: "unresolvable" });
    expect(capturedWarnings()).toContain(
      'device not moved: Track in path "t99/d0/c0" does not exist',
    );
  });

  it("spells the destination the way the caller sent it", () => {
    // Device duplication shifts track indices past its temp track, so the path
    // the move used is not the one the user typed.
    mockNonExistentObjects();

    expect(
      moveDeviceToPath(
        LiveAPI.from(device.path),
        "t100/d0/c0",
        LiveAPI.from(device.path),
        "t99/d0/c0",
      ),
    ).toStrictEqual({ outcome: "unresolvable" });
    expect(capturedWarnings()).toContain(
      'device not moved: Track in path "t99/d0/c0" does not exist',
    );
  });

  it("reports a move once the device is at the destination", () => {
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    // The mock is static, so the destination lists the device from the start;
    // that is what "the move landed" looks like when it is read back.
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children("device-0") },
    });

    const move = moveDeviceToPath(LiveAPI.from(device.path), "t1/d0");

    // The container comes back so a result can name the device by where the
    // call spelled it landing, without re-resolving toPath.
    expect(move.outcome).toBe("moved");
    expect(move.container?.id).toBe("track-1");
    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id device-0",
      "id track-1",
      0,
    );
  });

  it("reports a refusal when the device is not at the destination afterwards", () => {
    // Live drops a move it won't make without saying so, and a device that
    // never arrived must not be reported as one that did.
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("track-1", { path: livePath.track(1), type: "Track" });

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t1/d0")).toStrictEqual({
      outcome: "refused",
    });
    expect(capturedWarnings()).toContain(
      "Live refused the move of t0/d0 (id device-0)",
    );
  });

  it("names the source a duplication gave it, not the temp copy it moved", () => {
    // Both duplication paths hand the move a temp copy on a track the cleanup
    // is about to delete, so naming `device` here would print a dead id.
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("track-1", { path: livePath.track(1), type: "Track" });

    expect(
      moveDeviceToPath(
        LiveAPI.from(device.path),
        "t1/d0",
        null,
        "t1/d0",
        "t0/d0/c0/d0",
      ),
    ).toStrictEqual({ outcome: "refused" });
    expect(capturedWarnings()).toContain(
      "Live refused the move of t0/d0/c0/d0",
    );
  });

  it("names the one refusal Live's own state explains", () => {
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("device-0", {
      path: livePath.track(0).device(0),
      type: "Device",
      properties: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
    });
    registerMockObject("resident", {
      path: livePath.track(1).device(0),
      type: "Device",
      properties: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
    });
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children("resident") },
    });

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t1/d0")).toStrictEqual({
      outcome: "refused",
    });
    expect(capturedWarnings()).toContain(
      "Live refused the move of t0/d0 (id device-0): the destination already has an instrument, and only one is allowed",
    );
  });

  it("refuses an index past the end, which Live would drop in silence", () => {
    // Live takes 0 through the container's device count and ignores anything
    // higher without a word, so this can only be caught before the call.
    mockWorkingDeviceMoves();
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children("resident-0", "resident-1") },
    });

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t1/d9")).toStrictEqual({
      outcome: "refused",
    });
    expect(capturedWarnings()).toContain(
      'device not moved: "t1/d9" is past the end of a container holding 2 devices',
    );
  });

  it("catches an index past the end within the device's own container", () => {
    // The containment check below cannot see this one: a device moving inside
    // its own container is already in the list that check reads.
    mockWorkingDeviceMoves();
    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { devices: children("device-0") },
    });

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t0/d9")).toStrictEqual({
      outcome: "refused",
    });
    expect(capturedWarnings()).toContain(
      'device not moved: "t0/d9" is past the end of a container holding 1 device',
    );
  });

  it("allows the index equal to the count, which appends", () => {
    mockWorkingDeviceMoves();
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children("resident-0", "resident-1") },
    });

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t1/d2").outcome).toBe(
      "moved",
    );
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("past the end"),
    );
  });

  it("spells the destination the way the caller asked it to", () => {
    // Device duplication shifts track indices past its temp track, so the
    // warning has to name the path the user sent, not the one we moved to.
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children("resident-0") },
    });

    moveDeviceToPath(LiveAPI.from(device.path), "t1/d9", null, "t0/d9");

    expect(capturedWarnings()).toContain(
      'device not moved: "t0/d9" is past the end of a container holding 1 device',
    );
  });

  it("reports a missing destination, without moving", () => {
    // Callers word this one themselves; only they know the path the user sent.
    const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

    mockNonExistentObjects();

    expect(moveDeviceToPath(LiveAPI.from(device.path), "t99")).toStrictEqual({
      outcome: "no-destination",
    });
    expect(liveSet.call).not.toHaveBeenCalled();
    expect(capturedWarnings()).toHaveLength(0);
  });
});

describe("moveDeviceToPath - out of a trimmed chain", () => {
  const rackPath = livePath.track(0).device(0);
  const sourceChainPath = rackPath.chain(0);
  const destinationChainPath = rackPath.chain(1);
  let device: RegisteredMockObject;

  beforeEach(() => {
    mockWorkingDeviceMoves();
    registerMockObject("rack-0", {
      path: rackPath,
      type: "RackDevice",
      properties: {
        chains: children("chain-0", "chain-1"),
        can_have_drum_pads: 0,
      },
    });
    registerMockObject("chain-0", {
      path: sourceChainPath,
      type: "Chain",
      properties: { name: "Trimmed", devices: children("device-0") },
    });
    registerMockObject("mixer-0", { path: `${sourceChainPath} mixer_device` });
    registerMockObject("volume-0", {
      path: `${sourceChainPath} mixer_device volume`,
      properties: { display_value: -15 },
    });
    registerMockObject("chain-1", {
      path: destinationChainPath,
      type: "Chain",
    });
    registerMockObject("mixer-1", {
      path: `${destinationChainPath} mixer_device`,
    });
    // Already trimmed, so the source's fader has nowhere safe to be carried.
    registerMockObject("volume-1", {
      path: `${destinationChainPath} mixer_device volume`,
      properties: { display_value: -15 },
    });
    device = registerMockObject("device-0", {
      path: sourceChainPath.device(0),
      type: "SimplerDevice",
    });
  });

  it("warns that the trim stays behind on a plain move", () => {
    const move = moveDeviceToPath(LiveAPI.from(device.path), "t0/d0/c1");

    expect(move.outcome).toBe("moved");
    expect(capturedWarnings()).toContain(
      'chain "Trimmed" t0/d0/c0 (id chain-0) trim (gainDb -15) stays behind — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn',
    );
  });

  it("stays quiet when the caller already carried the chain's mixer", () => {
    // Chain duplication writes the mixer onto the copy before its devices
    // arrive, so a "stays behind" here would be false and name a temp track.
    const move = moveDeviceToPath(LiveAPI.from(device.path), "t0/d0/c1", null);

    expect(move.outcome).toBe("moved");
    expect(capturedWarnings()).toHaveLength(0);
  });
});

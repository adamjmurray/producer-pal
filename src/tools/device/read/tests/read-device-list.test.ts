// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";
import { readDevice } from "../read-device.ts";
import { setupBasicDeviceMock } from "./read-device-test-helpers.ts";

/** Register an instrument on track 1 and an effect on track 2. */
function setupDevices(): void {
  setupBasicDeviceMock({
    id: "device-1",
    path: String(livePath.track(1).device(0)),
    class_display_name: "Operator",
    type: 1,
  });
  setupBasicDeviceMock({
    id: "device-2",
    path: String(livePath.track(2).device(0)),
    class_display_name: "Reverb",
    type: 2,
  });
}

const device1 = {
  id: "device-1",
  path: "t1/d0",
  type: "instrument: Operator",
};
const device2 = {
  id: "device-2",
  path: "t2/d0",
  type: "audio-effect: Reverb",
};

describe("readDevice over a list of targets", () => {
  beforeEach(() => {
    clearMockRegistry();
    setupDevices();
    mockNonExistentObjects();
  });

  it("reads one device per id, in the order named", () => {
    expect(readDevice({ id: "device-2,device-1" })).toStrictEqual([
      device2,
      device1,
    ]);
  });

  it("reads one device per path, in the order named", () => {
    expect(readDevice({ path: "t2/d0, t1/d0" })).toStrictEqual([
      device2,
      device1,
    ]);
  });

  it("reads ids and paths together, ids first", () => {
    expect(readDevice({ id: "device-2", path: "t1/d0" })).toStrictEqual([
      device2,
      device1,
    ]);
  });

  it("takes the list from the ids and paths aliases", () => {
    expect(readDevice({ ids: "device-1", paths: "t2/d0" })).toStrictEqual([
      device1,
      device2,
    ]);
  });

  // The tool's own id alias names targets like `id` does, and adds up with the
  // paths. Left as its own param it would name the same device again in every
  // entry of the list.
  it("names targets by the deviceId alias too", () => {
    expect(readDevice({ deviceId: "device-1", path: "t2/d0" })).toStrictEqual([
      device1,
      device2,
    ]);
    expect(readDevice({ deviceId: "device-2,device-1" })).toStrictEqual([
      device2,
      device1,
    ]);
  });

  it("keeps a slot for a target it can't read, and says why", () => {
    expect(readDevice({ path: "t1/d0,t9/d0" })).toStrictEqual([
      device1,
      {
        path: "t9/d0",
        ok: false,
        reason: 'nothing at path "t9/d0"',
      },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("reports a miss by id the way the caller wrote it", () => {
    expect(readDevice({ id: "device-1,nope" })).toStrictEqual([
      device1,
      { id: "nope", ok: false, reason: 'id "nope" does not exist' },
    ]);
  });

  it("unwraps a single target", () => {
    expect(readDevice({ path: "t1/d0" })).toStrictEqual(device1);
  });

  it("still throws when the only target names nothing", () => {
    expect(() => readDevice({ id: "nope" })).toThrow(
      'id "nope" does not exist',
    );
  });

  it("refuses a list with an empty entry", () => {
    expect(() => readDevice({ path: "t1/d0,,t2/d0" })).toThrow(
      'invalid path "t1/d0,,t2/d0" - it has an empty entry',
    );
  });

  it("throws when nothing names a device", () => {
    expect(() => readDevice({})).toThrow("id or path is required");
  });
});

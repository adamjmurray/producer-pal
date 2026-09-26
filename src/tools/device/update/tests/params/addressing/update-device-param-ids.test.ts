// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  expectParamRefused,
  mockWorkingDeviceMoves,
  noParamLanded,
  paramsOf,
  registerDeviceWithParams,
  registerMockObject,
  updateDevice,
} from "../../update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

/**
 * @param name - The param's name
 * @returns Registration options for a 0–1 continuous param
 */
function continuousParam(name: string) {
  return {
    type: "DeviceParameter" as const,
    properties: {
      name,
      original_name: name,
      is_quantized: 0,
      value: 0.5,
      min: 0,
      max: 1,
    },
    methods: { str_for_value: (v: unknown) => String(v) },
  };
}

describe("updateDevice - params addressed by id", () => {
  let device: RegisteredMockObject;
  let volume: RegisteredMockObject;
  // A param whose name is the digits of another param's id.
  let namedOne: RegisteredMockObject;

  beforeEach(() => {
    device = registerDeviceWithParams("1", "42");
    namedOne = registerMockObject("42", {
      path: livePath.track(0).device(0).parameter(0),
      ...continuousParam("1"),
    });
    volume = registerMockObject("1", {
      path: livePath.track(0).device(0).parameter(1),
      ...continuousParam("Volume"),
    });
  });

  it("writes the param the id names", () => {
    const result = updateDevice({
      id: "dev1",
      params: [{ id: "1", value: "0.75" }],
    });

    expect(volume.set).toHaveBeenCalledWith("value", 0.75);
    // The param reads back the number asked for, so the entry only names it.
    expect(result).toStrictEqual({
      id: "dev1",
      path: "t0/d0",
      params: [{ id: "1", name: "Volume" }],
    });
  });

  it("is not shadowed by a param named with the same digits", () => {
    // By name, "1" reaches the param called "1"; by id it reaches id 1.
    updateDevice({ id: "dev1", params: [{ name: "1", value: "0.25" }] });
    updateDevice({ id: "dev1", params: [{ id: "1", value: "0.75" }] });

    expect(namedOne.set).toHaveBeenCalledWith("value", 0.25);
    expect(volume.set).toHaveBeenCalledWith("value", 0.75);
  });

  it("reports a miss under the id the call sent, and warns nowhere", () => {
    const message = noParamLanded(() =>
      updateDevice({
        id: "dev1",
        params: [
          { id: "999", value: "0.75" },
          { id: "N/A", value: "0.75" },
        ],
      }),
    );

    expect(message).toBe(
      'no param landed — "999": not found on t0/d0 (id dev1); "N/A": not found on t0/d0 (id dev1)',
    );
    expect(capturedWarnings()).toHaveLength(0);
  });

  it('falls back to "another object" for an owner the grammar can\'t spell', () => {
    // Live spells every device parameter under a track, so this only guards a
    // path the path grammar can't read — the refusal must still name where the
    // param lives rather than reading "id 55 is on , not ...".
    const foreign = registerMockObject("55", {
      path: "live_set some_future_holder 0 parameters 0",
      ...continuousParam("Elsewhere"),
    });

    const message = noParamLanded(() =>
      updateDevice({ id: "dev1", params: [{ id: "55", value: "0.75" }] }),
    );

    expect(foreign.set).not.toHaveBeenCalled();
    expect(message).toBe(
      'no param landed — "55": id 55 is on another object, not t0/d0 (id dev1), so it was not written',
    );
  });

  it("reports a refused value under the id", () => {
    expectParamRefused(
      () => updateDevice({ id: "dev1", params: [{ id: "1", value: "loud" }] }),
      "1",
      "loud",
    );

    expect(volume.set).not.toHaveBeenCalled();
  });

  // The OpenAI models fill the field they don't use with "" rather than
  // leaving it out.
  it("treats a blank name or id as absent", () => {
    updateDevice({
      id: "dev1",
      params: [
        { name: "", id: "1", value: "0.75" },
        { name: "1", id: " ", value: "0.25" },
      ],
    });

    expect(volume.set).toHaveBeenCalledWith("value", 0.75);
    expect(namedOne.set).toHaveBeenCalledWith("value", 0.25);
  });

  it("refuses an entry with neither a name nor an id", () => {
    expect(() =>
      updateDevice({
        id: "dev1",
        params: [
          { id: "1", value: "0.75" },
          { name: " ", value: "0.5" },
        ],
      }),
    ).toThrow("params entry 2 has neither a name nor an id");
    expect(volume.set).not.toHaveBeenCalled();
  });

  it("refuses an entry with both a name and an id", () => {
    expect(() =>
      updateDevice({
        id: "dev1",
        params: [{ name: "Volume", id: "1", value: "0.75" }],
      }),
    ).toThrow(
      'params entry 1 has both a name ("Volume") and an id (1) — send one',
    );
  });

  it("writes only the last of the same id twice", () => {
    const result = updateDevice({
      id: "dev1",
      params: [
        { id: "1", value: "0.75" },
        { id: "1", value: "0.25" },
      ],
    });

    expect(volume.set).toHaveBeenCalledTimes(1);
    expect(volume.set).toHaveBeenCalledWith("value", 0.25);
    expect(paramsOf(result)).toStrictEqual([
      { id: "1", ok: false, detail: "set again by id 1 later in the list" },
      { id: "1", name: "Volume" },
    ]);
  });

  it("reports an id that reaches nothing, sent twice, once per entry", () => {
    const message = noParamLanded(() =>
      updateDevice({
        id: "dev1",
        params: [
          { id: "999", value: "0.75" },
          { id: "999", value: "0.25" },
        ],
      }),
    );

    expect(message).toBe(
      'no param landed — "999": set again by id 999 later in the list; "999": not found on t0/d0 (id dev1)',
    );
  });

  const sameParamTwice = [
    { id: "1", value: "0.75" },
    { name: "Volume", value: "0.25" },
  ];

  it("writes only the last of an id and a name reaching one param", () => {
    const result = updateDevice({ id: "dev1", params: sameParamTwice });

    expect(volume.set).toHaveBeenCalledTimes(1);
    expect(volume.set).toHaveBeenCalledWith("value", 0.25);
    expect(paramsOf(result)).toStrictEqual([
      { id: "1", ok: false, detail: 'set again by "Volume" later in the list' },
      { id: "1", name: "Volume" },
    ]);
    expect(capturedWarnings()).toHaveLength(0);
  });

  it("still renames the device when a param is reached twice", () => {
    updateDevice({ id: "dev1", name: "Renamed", params: sameParamTwice });

    expect(device.set).toHaveBeenCalledWith("name", "Renamed");
    expect(volume.set).toHaveBeenCalledTimes(1);
    expect(volume.set).toHaveBeenCalledWith("value", 0.25);
  });

  it("still moves the device when a param is reached twice", () => {
    const liveSet = mockWorkingDeviceMoves();

    registerMockObject("track-0", {
      path: livePath.track(0),
      type: "Track",
      properties: { devices: children("dev1") },
    });
    registerMockObject("track-1", {
      path: livePath.track(1),
      type: "Track",
      properties: { devices: children() },
    });

    const result = updateDevice({
      id: "dev1",
      toPath: "t1/d+",
      params: sameParamTwice,
    });

    expect(liveSet.call).toHaveBeenCalledWith(
      "move_device",
      "id dev1",
      "id track-1",
      0,
    );
    expect(volume.set).toHaveBeenCalledTimes(1);
    expect(volume.set).toHaveBeenCalledWith("value", 0.25);
    expect(paramsOf(result)[0]).toStrictEqual({
      id: "1",
      ok: false,
      detail: 'set again by "Volume" later in the list',
    });
  });

  it("does not confuse id 1 with the param named 1 when deduplicating", () => {
    updateDevice({
      id: "dev1",
      params: [
        { id: "1", value: "0.75" },
        { name: "1", value: "0.25" },
      ],
    });

    expect(volume.set).toHaveBeenCalledWith("value", 0.75);
    expect(namedOne.set).toHaveBeenCalledWith("value", 0.25);
  });
});

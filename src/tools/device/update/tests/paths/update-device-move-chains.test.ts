// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A toPath reaching past a rack's last chain makes the chains below it too, and
// the moved device's entry names them.

import { beforeEach, describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  registerFixedChainRack,
  registerLive12Rack,
} from "../../../tests/helpers/fixed-chain-rack-fixtures.ts";
import {
  registerGrowingRack,
  registerMoveSourceAndRackTrack,
} from "../../../tests/helpers/growing-rack-fixtures.ts";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
} from "#src/tools/constants.ts";
import {
  mockWorkingDeviceMoves,
  updateDevice,
} from "../update-device-test-helpers.ts";

describe("updateDevice - a toPath that makes chains", () => {
  beforeEach(() => {
    mockWorkingDeviceMoves();
    registerMoveSourceAndRackTrack();
  });

  it("names the chains the move had to make first", () => {
    registerGrowingRack({ track: 1, existing: 1 });

    expect(updateDevice({ id: "src-0", toPath: "t1/d0/c2/d+" })).toStrictEqual({
      id: "src-0",
      path: "t1/d0/c2/d0",
      created: "c1-c2",
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("says nothing when the chain the move names is already there", () => {
    registerGrowingRack({ track: 1, existing: 2 });

    expect(updateDevice({ id: "src-0", toPath: "t1/d0/c1/d+" })).toStrictEqual({
      id: "src-0",
      path: "t1/d0/c1/d0",
    });
  });
});

// A toPath that would add a chain to a Live 13 rack with fixed chains is refused
// and the device stays put. Live 12 reads the limit as a bare 1.
const MULTIBAND =
  "Multiband Rack (id rack) has a fixed 3 chains (Low, Mid, High), so it can't take another";

describe("updateDevice — a toPath into a rack with fixed chains", () => {
  beforeEach(() => {
    mockWorkingDeviceMoves();
    registerMoveSourceAndRackTrack();
  });

  it("refuses a c+ and moves nothing", () => {
    const rack = registerFixedChainRack(1, "multiband");

    expect(() => updateDevice({ id: "src-0", toPath: "t1/d0/c+" })).toThrow(
      MULTIBAND,
    );
    expect(rack.call).not.toHaveBeenCalledWith("insert_chain");
  });

  it("refuses a c<n> past the last chain", () => {
    registerFixedChainRack(1, "multiband");

    expect(() => updateDevice({ id: "src-0", toPath: "t1/d0/c3/d+" })).toThrow(
      MULTIBAND,
    );
  });

  it("still moves into a chain the rack has", () => {
    registerFixedChainRack(1, "multiband");

    expect(updateDevice({ id: "src-0", toPath: "t1/d0/c0/d+" })).toStrictEqual({
      id: "src-0",
      path: "t1/d0/c0/d0",
    });
  });

  it("still appends a chain on Live 12, where the property reads 1", () => {
    const rack = registerLive12Rack(1, 2);

    expect(updateDevice({ id: "src-0", toPath: "t1/d0/c+" })).toStrictEqual({
      id: "src-0",
      path: "t1/d0/c2/d0",
    });
    expect(rack.call).toHaveBeenCalledWith("insert_chain");
  });
});

// A destination the move can't take is refused before it makes a chain or
// moves anything: the device stays where it was and no chain is left behind.
describe("updateDevice - a toPath refused before anything is made", () => {
  it.each([
    [
      "a c+ on a full fixed-chain rack",
      "t1/d0/c+",
      () => registerFixedChainRack(1, "multiband"),
      "Multiband Rack (id rack) has a fixed 3 chains",
    ],
    [
      "a chain past a full fixed-chain rack's last",
      "t1/d0/c5/d+",
      () => registerFixedChainRack(1, "multiband"),
      "Multiband Rack (id rack) has a fixed 3 chains",
    ],
    [
      "more chains than are made for one path",
      "t1/d0/c40/d+",
      () => registerGrowingRack({ track: 1, existing: 1 }),
      "not moved: Cannot auto-create 40 chains (max: 16)",
    ],
    [
      "an index past the end",
      "t1/d9",
      () => registerFixedChainRack(1, "midSide"),
      'not moved to "t1/d9": "t1/d9" is past the end of a container holding 1 device',
    ],
    [
      "an index past the end of a chain the path would make",
      "t1/d0/c9/d2",
      () => registerGrowingRack({ track: 1, existing: 1 }),
      'not moved to "t1/d0/c9/d2": "t1/d0/c9/d2" is past the end of a container holding 0 devices',
    ],
  ])("refuses %s", (_what, toPath, registerRack, refusal) => {
    const liveSet = mockWorkingDeviceMoves();

    registerMoveSourceAndRackTrack();

    const rack = registerRack();

    expect(() => updateDevice({ id: "src-0", toPath })).toThrow(refusal);
    expect(rack.call).not.toHaveBeenCalled();
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("refuses an instrument for a chain an audio effect rack would make", () => {
    const liveSet = mockWorkingDeviceMoves();

    registerMoveSourceAndRackTrack();

    const rack = registerGrowingRack({ track: 1, existing: 1 });

    rack.properties.type = LIVE_API_DEVICE_TYPE_AUDIO_EFFECT;
    lookupMockObject("src-0")!.properties.type =
      LIVE_API_DEVICE_TYPE_INSTRUMENT;

    expect(() => updateDevice({ id: "src-0", toPath: "t1/d0/c+" })).toThrow(
      /^not moved to "t1\/d0\/c\+": chain t1\/d0\/c1 takes only audio effects; ".*" is an instrument$/,
    );
    expect(rack.call).not.toHaveBeenCalled();
    expect(liveSet.call).not.toHaveBeenCalled();
  });

  it("answers no destination for a pad path on a rack with no pads", () => {
    const liveSet = mockWorkingDeviceMoves();

    registerMoveSourceAndRackTrack();

    const rack = registerGrowingRack({ track: 1, existing: 1 });

    expect(() => updateDevice({ id: "src-0", toPath: "t1/d0/pC1/d+" })).toThrow(
      'not moved: nothing at toPath "t1/d0/pC1/d+"',
    );
    expect(rack.call).not.toHaveBeenCalled();
    expect(liveSet.call).not.toHaveBeenCalled();
  });
});

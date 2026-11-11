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

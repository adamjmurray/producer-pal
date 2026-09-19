// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  insertionContainerPath,
  resolveInsertionPath,
} from "../insertion-path.ts";

const RACK_PATH = "live_set tracks 0 devices 0";

/** Register a track holding a rack with one chain, plus a drum pad on C1. */
function registerRack({ drum = false }: { drum?: boolean } = {}): void {
  registerMockObject("track-0", { path: livePath.track(0), type: "Track" });
  registerMockObject("chain-0", {
    path: `${RACK_PATH} chains 0`,
    type: drum ? "DrumChain" : "Chain",
    properties: drum ? { in_note: 36 } : {},
  });
  registerMockObject("rack", {
    path: RACK_PATH,
    type: "RackDevice",
    properties: {
      chains: ["id", "chain-0"],
      can_have_chains: 1,
      can_have_drum_pads: drum ? 1 : 0,
    },
  });
}

describe('resolveInsertionPath, the "d+" that appends a device', () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("appends to the track above it", () => {
    registerRack();

    const { container, position, containerPath } =
      resolveInsertionPath("t0/d+");

    expect(container?.path).toBe("live_set tracks 0");
    // Live's insert_device with no index appends within the device's own
    // section, so there is no position to work out.
    expect(position).toBeNull();
    expect(containerPath).toBe("t0");
  });

  it("appends to the chain above it", () => {
    registerRack();

    const { container, position, containerPath } =
      resolveInsertionPath("t0/d0/c0/d+");

    expect(container?.path).toBe(`${RACK_PATH} chains 0`);
    expect(position).toBeNull();
    expect(containerPath).toBe("t0/d0/c0");
  });

  it("appends to a drum pad's chain", () => {
    registerRack({ drum: true });

    const { container, containerPath } = resolveInsertionPath("t0/d0/pC1/d+");

    expect(container?.path).toBe(`${RACK_PATH} chains 0`);
    // The caller's own pad spelling, not the rack-relative chain index.
    expect(containerPath).toBe("t0/d0/pC1");
  });

  // The bare container did the appending before `d+` existed, and still does.
  it.each([
    ["t0/d+", "t0"],
    ["t0/d0/c0/d+", "t0/d0/c0"],
  ])("resolves %s the same as the bare %s", (append, bare) => {
    registerRack();

    const appended = resolveInsertionPath(append);

    clearMockRegistry();
    registerRack();

    const plain = resolveInsertionPath(bare);

    expect(appended.container?.path).toBe(plain.container?.path);
    expect(appended.position).toBe(plain.position);
    expect(appended.containerPath).toBe(plain.containerPath);
  });
});

describe('insertionContainerPath, the "d+" that appends a device', () => {
  it.each([
    ["t0/d+", "t0"],
    ["mt/d0/c1/d+", "mt/d0/c1"],
    ["t0/d0/pC1/c1/d+", "t0/d0/pC1/c1"],
  ])("drops the %s to name its container", (path, expected) => {
    expect(insertionContainerPath(path)).toBe(expected);
  });

  // The lexical fallback for a path the grammar can't parse has to trim a "d+"
  // too, or a result names the place instead of the container.
  it("trims a d+ off a path it can't parse", () => {
    expect(insertionContainerPath("r0/d+")).toBe("r0");
  });
});

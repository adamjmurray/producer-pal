// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A pad path aimed at an Instrument Rack that holds the kit (t0/d0/pD3 when the
// kit is t0/d0/c0/d0) misses. Every tool that reports that miss names the path
// that works.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "#src/tools/actions/delete/delete.ts";
import { createDevice } from "#src/tools/device/create/create-device.ts";
import { updateDevice } from "#src/tools/device/update/update-device.ts";
import { resolvePathForType } from "#src/tools/shared/validation/id-per-path.ts";
import { nestedRackHintForPath } from "../helpers/path/nested-rack-hint.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  warnOnce: vi.fn(),
}));

const NESTED = ' — the drum rack is nested; try "t0/d0/c0/d0/pD3';

/** An Instrument Rack whose first chain holds the Drum Rack. */
function registerNestedKit(): void {
  const rack = livePath.track(0).device(0);

  registerMockObject("outer-rack", {
    path: rack,
    type: "RackDevice",
    properties: { can_have_drum_pads: 0, chains: children("outer-chain") },
  });
  registerMockObject("outer-chain", {
    path: rack.chain(0),
    type: "Chain",
    properties: { devices: children("kit") },
  });
  registerMockObject("kit", {
    path: rack.chain(0).device(0),
    type: "RackDevice",
    properties: { can_have_drum_pads: 1, has_drum_pads: 1 },
  });
}

describe("a pad path that misses because the kit is nested", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerNestedKit();
  });

  it.each([
    ["drum-pad", "t0/d0/pD3", 'drum-pad at path "t0/d0/pD3" does not exist'],
    [
      "chain",
      "t0/d0/pD3/c0",
      'chain at path "t0/d0/pD3/c0" does not exist',
      "/c0",
    ],
    [
      "device",
      "t0/d0/pD3/c0/d0",
      'device at path "t0/d0/pD3/c0/d0" does not exist',
      "/c0/d0",
    ],
  ])(
    "tells a delete or duplicate by path which path works (%s)",
    (type, path, reason, tail = "") => {
      expect(resolvePathForType(type, path)).toStrictEqual({
        entry: path,
        id: null,
        reason: `${reason}${NESTED}${tail}"`,
        empty: true,
      });
    },
  );

  it("tells ppal-create-device which path works", async () => {
    await expect(
      createDevice({ device: "Simpler", path: "t0/d0/pD3" }),
    ).rejects.toThrow(`container at path "t0/d0/pD3" does not exist${NESTED}"`);
  });

  it("keeps the append marker in the suggestion", () => {
    expect(nestedRackHintForPath("t0/d0/pD3/d+")).toBe(`${NESTED}/d+"`);
    expect(nestedRackHintForPath("t0/d0/pD3/c+")).toBe(`${NESTED}/c+"`);
  });

  it("tells ppal-update-device which path works", () => {
    expect(() => updateDevice({ path: "t0/d0/pD3", name: "x" })).toThrow(
      `nothing at path "t0/d0/pD3"${NESTED}"`,
    );
  });

  // The target stays "nothing to delete" (already done), so the hint rides on
  // that entry rather than turning it into a skip.
  it("tells ppal-delete which path works, without refusing", () => {
    expect(deleteObject({ type: "drum-pad", path: "t0/d0/pD3" })).toStrictEqual(
      { path: "t0/d0/pD3", detail: `nothing to delete${NESTED}"` },
    );
  });

  it("tells a ppal-update-device move which toPath works", () => {
    registerMockObject("moved", {
      path: livePath.track(1).device(0),
      type: "PluginDevice",
    });
    registerMockObject("live_set", { path: livePath.liveSet });

    expect(() => updateDevice({ id: "moved", toPath: "t0/d0/pD3" })).toThrow(
      `not moved: nothing at toPath "t0/d0/pD3"${NESTED}"`,
    );
  });

  it("adds no hint when the path names no pad", () => {
    expect(nestedRackHintForPath("t0/d0/c0")).toBe("");
    expect(nestedRackHintForPath("t0")).toBe("");
  });

  it("adds no hint when the rack named is the kit itself", () => {
    expect(nestedRackHintForPath("t0/d0/c0/d0/pD3")).toBe("");
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// peekInsertionContainerPath names a destination's container by Live path, and
// never makes a chain to do it.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { registerLayeredDrumRack } from "#src/tools/device/tests/helpers/device-rack-fixtures.ts";
import { peekInsertionContainerPath } from "../insertion-path.ts";

describe("peekInsertionContainerPath", () => {
  it.each([
    ["t2", "live_set tracks 2"],
    ["t2/d+", "live_set tracks 2"],
    ["t2/d3", "live_set tracks 2"],
    ["rt1/d0", "live_set return_tracks 1"],
    ["mt/d0", "live_set master_track"],
    ["t0/d1/c2/d0", "live_set tracks 0 devices 1 chains 2"],
    // The chain a `c+` would make isn't there to name: its rack is.
    ["t0/d1/c+", "live_set tracks 0 devices 1"],
  ])("names %s's container", (path, expected) => {
    expect(peekInsertionContainerPath(path)).toBe(expected);
  });

  it("answers null for a type segment that names no device", () => {
    registerMockObject("track0", {
      path: livePath.track(0),
      properties: { devices: [] },
    });

    expect(peekInsertionContainerPath("t0/afx5/c0/d0")).toBeNull();
  });

  describe("through a drum pad", () => {
    it("names the chain a pad's path reaches, whichever way it is spelled", () => {
      registerLayeredDrumRack();

      // Pad C1 holds chains 0 and 2; D1 holds chain 1.
      expect(peekInsertionContainerPath("t0/d0/pC1/d3")).toBe(
        "live_set tracks 0 devices 0 chains 0",
      );
      expect(peekInsertionContainerPath("t0/d0/pC1/c1/d0")).toBe(
        "live_set tracks 0 devices 0 chains 2",
      );
      expect(peekInsertionContainerPath("t0/d0/pD1")).toBe(
        "live_set tracks 0 devices 0 chains 1",
      );
    });

    it("names the rack for a new layer on a pad", () => {
      registerLayeredDrumRack();

      expect(peekInsertionContainerPath("t0/d0/pC1/c+")).toBe(
        "live_set tracks 0 devices 0",
      );
    });

    it("names a rack nested in a pad's chain for a c+ below it", () => {
      registerLayeredDrumRack({
        chainProperties: (index) =>
          index === 1 ? { devices: children("nested") } : {},
      });
      registerMockObject("nested", {
        path: livePath.track(0).device(0).chain(1).device(0),
      });

      expect(peekInsertionContainerPath("t0/d0/pD1/d0/c+")).toBe(
        "live_set tracks 0 devices 0 chains 1 devices 0",
      );
    });

    it("answers null for a pad with no chain to name", () => {
      registerLayeredDrumRack();

      expect(peekInsertionContainerPath("t0/d0/pE1/d0")).toBeNull();
    });
  });
});

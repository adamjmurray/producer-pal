// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  assertNoTakeLaneOverlap,
  MAX_TAKE_LANES,
  normalizeTakeLaneTarget,
  resolveTakeLane,
} from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import {
  registerTakeLaneTrack,
  registerTakeLaneWithClips,
} from "./take-lane-test-helpers.ts";

describe("normalizeTakeLaneTarget", () => {
  it("treats main-lane values as null", () => {
    expect(normalizeTakeLaneTarget(null)).toBeNull();
    expect(normalizeTakeLaneTarget(undefined)).toBeNull();
    expect(normalizeTakeLaneTarget("")).toBeNull();
    expect(normalizeTakeLaneTarget(0)).toBeNull();
    expect(normalizeTakeLaneTarget("0")).toBeNull();
  });

  it('passes "new" through', () => {
    expect(normalizeTakeLaneTarget("new")).toBe("new");
  });

  it("coerces positive integers (number or string)", () => {
    expect(normalizeTakeLaneTarget(3)).toBe(3);
    expect(normalizeTakeLaneTarget("2")).toBe(2);
  });

  it("throws on invalid values", () => {
    expect(() => normalizeTakeLaneTarget(-1)).toThrow(/takeLane must be/);
    expect(() => normalizeTakeLaneTarget(1.5)).toThrow(/takeLane must be/);
    expect(() => normalizeTakeLaneTarget("abc")).toThrow(/takeLane must be/);
  });
});

describe("resolveTakeLane", () => {
  it('appends a fresh lane for "new"', () => {
    const track = registerTakeLaneTrack({ initialLanes: 1 });
    const trackApi = LiveAPI.from(livePath.track(0));

    const { lane, laneNumber } = resolveTakeLane(trackApi, "new");

    expect(laneNumber).toBe(2);
    expect(lane.path).toBe("live_set tracks 0 take_lanes 1");
    expect(track.call).toHaveBeenCalledWith("create_take_lane");
  });

  it("reuses an existing lane for a number within range", () => {
    const track = registerTakeLaneTrack({ initialLanes: 2 });
    const trackApi = LiveAPI.from(livePath.track(0));

    const { lane, laneNumber } = resolveTakeLane(trackApi, 1);

    expect(laneNumber).toBe(1);
    expect(lane.path).toBe("live_set tracks 0 take_lanes 0");
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  it("auto-creates lanes up to the target index", () => {
    const track = registerTakeLaneTrack({ initialLanes: 0 });
    const trackApi = LiveAPI.from(livePath.track(0));

    const { lane, laneNumber } = resolveTakeLane(trackApi, 3);

    expect(laneNumber).toBe(3);
    expect(lane.path).toBe("live_set tracks 0 take_lanes 2");
    expect(track.call).toHaveBeenCalledTimes(3);
  });

  it("names a newly created lane but never renames an existing one", () => {
    registerTakeLaneTrack({ initialLanes: 1 });
    const trackApi = LiveAPI.from(livePath.track(0));

    const created = resolveTakeLane(trackApi, "new", "Variation A");

    expect(created.lane.set).toHaveBeenCalledWith("name", "Variation A");

    const existing = resolveTakeLane(
      LiveAPI.from(livePath.track(0)),
      1,
      "Should Not Rename",
    );

    expect(existing.lane.set).not.toHaveBeenCalledWith(
      "name",
      "Should Not Rename",
    );
  });

  it("enforces the take lane cap", () => {
    registerTakeLaneTrack({ initialLanes: MAX_TAKE_LANES });
    const trackApi = LiveAPI.from(livePath.track(0));

    expect(() => resolveTakeLane(trackApi, "new")).toThrow(
      /reached the 8 take lane limit/,
    );
    expect(() => resolveTakeLane(trackApi, MAX_TAKE_LANES + 1)).toThrow(
      /reached the 8 take lane limit/,
    );
  });
});

describe("assertNoTakeLaneOverlap", () => {
  it("throws when a clip overlaps the target range", () => {
    registerTakeLaneWithClips(0, 0, [{ start: 0, end: 4 }]);
    const laneApi = LiveAPI.from(livePath.track(0).takeLane(0));

    expect(() => assertNoTakeLaneOverlap(laneApi, 2, 4, 1, "1|3")).toThrow(
      /Clip exists at 1\|3 on take lane 1/,
    );
  });

  it("does not throw for a non-overlapping position", () => {
    registerTakeLaneWithClips(0, 0, [{ start: 0, end: 4 }]);
    const laneApi = LiveAPI.from(livePath.track(0).takeLane(0));

    expect(() =>
      assertNoTakeLaneOverlap(laneApi, 4, 4, 1, "2|1"),
    ).not.toThrow();
  });

  it("does not throw for an empty lane", () => {
    registerTakeLaneWithClips(0, 0, []);
    const laneApi = LiveAPI.from(livePath.track(0).takeLane(0));

    expect(() =>
      assertNoTakeLaneOverlap(laneApi, 0, 4, 1, "1|1"),
    ).not.toThrow();
  });
});

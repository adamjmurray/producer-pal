// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  isTakeLaneClip,
  isTakeLaneRequested,
  MAX_TAKE_LANES,
  normalizeTakeLaneTarget,
  resolveTakeLane,
  resolveTakeLaneForDuplicate,
} from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import { registerTakeLaneTrack } from "./take-lane-test-helpers.ts";

describe("isTakeLaneClip", () => {
  it("matches a take-lane clip path (single- and multi-digit lane index)", () => {
    // Multi-digit index proves the `\d+` quantifier (not a single `\d`) — a
    // two-digit lane like `take_lanes 12` must still match.
    expect(
      isTakeLaneClip(
        LiveAPI.from("live_set tracks 0 take_lanes 12 arrangement_clips 0"),
      ),
    ).toBe(true);
    expect(
      isTakeLaneClip(
        LiveAPI.from("live_set tracks 0 take_lanes 0 arrangement_clips 3"),
      ),
    ).toBe(true);
  });

  it("does not match a main-lane arrangement clip path", () => {
    expect(
      isTakeLaneClip(LiveAPI.from("live_set tracks 0 arrangement_clips 0")),
    ).toBe(false);
  });
});

describe("resolveTakeLaneForDuplicate", () => {
  it("ignores (and warns for) takeLane on a non-clip duplicate", () => {
    const warn = vi.fn();

    expect(
      resolveTakeLaneForDuplicate("track", "arrangement", 2, warn),
    ).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("only supported when duplicating clips"),
    );
  });

  it("does not warn for a non-clip duplicate when no take lane was requested", () => {
    const warn = vi.fn();

    expect(
      resolveTakeLaneForDuplicate("track", "arrangement", 0, warn),
    ).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("ignores (and warns for) takeLane on a session-destination clip duplicate", () => {
    const warn = vi.fn();

    expect(resolveTakeLaneForDuplicate("clip", "session", 3, warn)).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("session destination"),
    );
  });

  it("does not warn for a session clip duplicate when no take lane was requested", () => {
    const warn = vi.fn();

    expect(
      resolveTakeLaneForDuplicate("clip", "session", null, warn),
    ).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("normalizes the target for an arrangement clip duplicate", () => {
    const warn = vi.fn();

    expect(resolveTakeLaneForDuplicate("clip", "arrangement", 2, warn)).toBe(2);
    expect(
      resolveTakeLaneForDuplicate("clip", "arrangement", "new", warn),
    ).toBe("new");
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("isTakeLaneRequested", () => {
  it("is false for main-lane values", () => {
    expect(isTakeLaneRequested(null)).toBe(false);
    expect(isTakeLaneRequested(undefined)).toBe(false);
    expect(isTakeLaneRequested("")).toBe(false);
    expect(isTakeLaneRequested(0)).toBe(false);
    expect(isTakeLaneRequested("0")).toBe(false);
  });

  it("is true for any non-main value (including invalid ones)", () => {
    expect(isTakeLaneRequested(1)).toBe(true);
    expect(isTakeLaneRequested("new")).toBe(true);
    expect(isTakeLaneRequested(-1)).toBe(true);
    expect(isTakeLaneRequested("abc")).toBe(true);
  });
});

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

  it("allows targeting exactly the cap-numbered lane (boundary is > not >=)", () => {
    // Targeting lane MAX_TAKE_LANES (8) when 8 already exist is at the cap, not
    // over it — it must resolve, not throw. Guards the `>` vs `>=` boundary.
    registerTakeLaneTrack({ initialLanes: MAX_TAKE_LANES });
    const trackApi = LiveAPI.from(livePath.track(0));

    const { laneNumber } = resolveTakeLane(trackApi, MAX_TAKE_LANES);

    expect(laneNumber).toBe(MAX_TAKE_LANES);
  });

  it("does not name a newly created lane when the name is empty string", () => {
    // An empty takeLaneName must be treated as "no name" — the created lane is
    // left unnamed (guards the `!== ""` check, distinct from a non-empty name).
    const track = registerTakeLaneTrack({ initialLanes: 0 });
    const trackApi = LiveAPI.from(livePath.track(0));

    const { lane } = resolveTakeLane(trackApi, "new", "");

    expect(lane.set).not.toHaveBeenCalledWith("name", expect.anything());
    expect(track.call).toHaveBeenCalledWith("create_take_lane");
  });
});

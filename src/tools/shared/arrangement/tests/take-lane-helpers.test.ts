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
  takeLaneLabel,
  takeLaneTargetsThatFit,
  warnUnusedTakeLane,
  type ArrangementTrack,
} from "#src/tools/shared/arrangement/take-lane-helpers.ts";
import { registerTakeLaneTrack } from "./helpers/take-lane-test-helpers.ts";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

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

describe("warnUnusedTakeLane", () => {
  it("warns for takeLane on a non-clip duplicate", () => {
    const warn = vi.fn();

    warnUnusedTakeLane("track", "arrangement", 2, warn);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("only supported when duplicating clips"),
    );
  });

  it("warns for takeLane on a session-destination clip duplicate", () => {
    const warn = vi.fn();

    warnUnusedTakeLane("clip", "session", 3, warn);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("session destination"),
    );
  });

  it("warns for takeLaneName the same way, and names both when both are sent", () => {
    const warn = vi.fn();

    warnUnusedTakeLane("track", "arrangement", null, warn, "Verse take");
    warnUnusedTakeLane("clip", "session", 3, warn, "Verse take");

    expect(warn).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("takeLaneName ignored"),
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("takeLane and takeLaneName ignored"),
    );
  });

  it("stays quiet when no take lane was requested", () => {
    const warn = vi.fn();

    warnUnusedTakeLane("track", "arrangement", 0, warn);
    warnUnusedTakeLane("clip", "session", null, warn);
    warnUnusedTakeLane("track", "arrangement", 0, warn, "");

    expect(warn).not.toHaveBeenCalled();
  });

  it("stays quiet for an arrangement clip duplicate, which uses it", () => {
    const warn = vi.fn();

    warnUnusedTakeLane("clip", "arrangement", 2, warn);
    warnUnusedTakeLane("clip", "arrangement", "new", warn);

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

  // takeLane is deprecated, so a caller dropping it can still send the word
  // written out, and it has to read as unset.
  it("is false for a coerced null", () => {
    expect(isTakeLaneRequested("null")).toBe(false);
    expect(isTakeLaneRequested("undefined")).toBe(false);
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

  it("treats a coerced null as the main lane, not an error", () => {
    expect(normalizeTakeLaneTarget("null")).toBeNull();
    expect(normalizeTakeLaneTarget("undefined")).toBeNull();
  });

  it('passes "new" through', () => {
    expect(normalizeTakeLaneTarget("new")).toBe("new");
  });

  // The param is 1-based, the target is the Live API index.
  it("coerces positive integers (number or string) to a 0-based index", () => {
    expect(normalizeTakeLaneTarget(3)).toBe(2);
    expect(normalizeTakeLaneTarget("2")).toBe(1);
    expect(normalizeTakeLaneTarget(1)).toBe(0);
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

    const { lane, laneIndex } = resolveTakeLane(trackApi, "new");

    expect(laneIndex).toBe(1);
    expect(lane.path).toBe("live_set tracks 0 take_lanes 1");
    expect(track.call).toHaveBeenCalledWith("create_take_lane");
  });

  it("reuses an existing lane for a number within range", () => {
    const track = registerTakeLaneTrack({ initialLanes: 2 });
    const trackApi = LiveAPI.from(livePath.track(0));

    const { lane, laneIndex } = resolveTakeLane(trackApi, 0);

    expect(laneIndex).toBe(0);
    expect(lane.path).toBe("live_set tracks 0 take_lanes 0");
    expect(track.call).not.toHaveBeenCalledWith("create_take_lane");
  });

  it("auto-creates lanes up to the target index", () => {
    const track = registerTakeLaneTrack({ initialLanes: 0 });
    const trackApi = LiveAPI.from(livePath.track(0));

    const { lane, laneIndex } = resolveTakeLane(trackApi, 2);

    expect(laneIndex).toBe(2);
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

    // Regression: it was the one inapplicable param on these tools dropped
    // without a word, so the caller saw a successful duplicate onto a lane
    // still carrying its old name.
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("takeLaneName ignored"),
    );
  });

  // The two ways past the cap need different advice: an "l+" on a full track is
  // out of room, while "l9" is a bad number on any track — telling that caller
  // to delete lanes sends them the wrong way.
  it("enforces the take lane cap", () => {
    registerTakeLaneTrack({ initialLanes: MAX_TAKE_LANES });
    const trackApi = LiveAPI.from(livePath.track(0));

    expect(() => resolveTakeLane(trackApi, "new")).toThrow(
      /reached the 8 take lane limit/,
    );
    expect(() => resolveTakeLane(trackApi, MAX_TAKE_LANES + 1)).toThrow(
      /take lane "l9" is out of range: a track has "l0" through "l7"/,
    );
  });

  it("calls an out-of-range lane out of range on an empty track", () => {
    registerTakeLaneTrack({ initialLanes: 0 });

    expect(() =>
      resolveTakeLane(LiveAPI.from(livePath.track(0)), MAX_TAKE_LANES),
    ).toThrow(/take lane "l8" is out of range/);
  });

  it("allows targeting exactly the cap-numbered lane (boundary is > not >=)", () => {
    // Targeting the last lane MAX_TAKE_LANES allows (index 7) when 8 already
    // exist is at the cap, not over it — it must resolve, not throw. Guards the
    // `>` vs `>=` boundary.
    registerTakeLaneTrack({ initialLanes: MAX_TAKE_LANES });
    const trackApi = LiveAPI.from(livePath.track(0));

    const { laneIndex } = resolveTakeLane(trackApi, MAX_TAKE_LANES - 1);

    expect(laneIndex).toBe(MAX_TAKE_LANES - 1);
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

describe("takeLaneLabel", () => {
  // The ordinal that takeLaneKey appends keeps two written l+ apart internally.
  // It is not something the caller wrote, so it stays out of messages.
  it("spells an l+ without its ordinal", () => {
    expect(takeLaneLabel({ trackIndex: 0, takeLane: "new" })).toBe("t0/l+");
    expect(
      takeLaneLabel({ trackIndex: 3, takeLane: "new", newLaneOrdinal: 1 }),
    ).toBe("t3/l+");
  });

  it("spells a numbered lane and the main lane", () => {
    expect(takeLaneLabel({ trackIndex: 2, takeLane: 5 })).toBe("t2/l5");
    expect(takeLaneLabel({ trackIndex: 2, takeLane: null })).toBe("t2");
  });
});

describe("takeLaneTargetsThatFit", () => {
  it("counts the lanes earlier destinations will create", () => {
    // l7 auto-creates 8 lanes, leaving no room for l+. Checking each
    // destination against the pre-call count misses this and fails mid-resolve,
    // after those 8 permanent lanes already exist.
    registerTakeLaneTrack({ initialLanes: 0 });

    const fitting = takeLaneTargetsThatFit(
      [
        { trackIndex: 0, takeLane: 7 },
        { trackIndex: 0, takeLane: "new" },
      ],
      "duplicate",
    );

    expect(fitting).toStrictEqual([{ trackIndex: 0, takeLane: 7 }]);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipping "t0/l+"'),
    );
  });

  it("keeps the destinations alongside one that does not fit", () => {
    registerTakeLaneTrack({ trackIndex: 0, initialLanes: MAX_TAKE_LANES });
    registerTakeLaneTrack({ trackIndex: 1, initialLanes: 0 });

    const fitting = takeLaneTargetsThatFit(
      [
        { trackIndex: 0, takeLane: "new" },
        { trackIndex: 1, takeLane: "new" },
      ],
      "duplicate",
    );

    expect(fitting).toStrictEqual([{ trackIndex: 1, takeLane: "new" }]);
  });

  it("warns once for a repeated destination that does not fit", () => {
    registerTakeLaneTrack({ initialLanes: 0 });

    const fitting = takeLaneTargetsThatFit(
      [
        { trackIndex: 0, takeLane: MAX_TAKE_LANES },
        { trackIndex: 0, takeLane: MAX_TAKE_LANES },
      ],
      "createClip",
    );

    expect(fitting).toStrictEqual([]);
    expect(consoleMock.warn).toHaveBeenCalledTimes(1);
    expect(consoleMock.warn).toHaveBeenCalledWith(
      'createClip: skipping "t0/l8" — take lane "l8" is out of range: a track has "l0" through "l7"',
    );
  });

  it("keeps a call whose lanes all fit", () => {
    registerTakeLaneTrack({ initialLanes: 0 });

    // l+ takes lane 0, then l7 fills up to lane 7: 8 lanes, exactly the cap.
    const targets: ArrangementTrack[] = [
      { trackIndex: 0, takeLane: "new" },
      { trackIndex: 0, takeLane: 7 },
    ];

    expect(takeLaneTargetsThatFit(targets, "duplicate")).toStrictEqual(targets);
    expect(consoleMock.warn).not.toHaveBeenCalled();
  });

  it("counts repeated l+ on one track as the single lane it resolves to", () => {
    registerTakeLaneTrack({ initialLanes: MAX_TAKE_LANES - 1 });

    const targets: ArrangementTrack[] = [
      { trackIndex: 0, takeLane: "new" },
      { trackIndex: 0, takeLane: "new" },
    ];

    expect(takeLaneTargetsThatFit(targets, "duplicate")).toStrictEqual(targets);
    expect(consoleMock.warn).not.toHaveBeenCalled();
  });

  it("counts each track separately and drops main-lane destinations", () => {
    registerTakeLaneTrack({ trackIndex: 0, initialLanes: 4 });
    registerTakeLaneTrack({ trackIndex: 1, initialLanes: 4 });

    const fitting = takeLaneTargetsThatFit(
      [
        { trackIndex: 0, takeLane: 7 },
        { trackIndex: 1, takeLane: "new" },
        { trackIndex: 0, takeLane: null },
      ],
      "duplicate",
    );

    expect(fitting).toStrictEqual([
      { trackIndex: 0, takeLane: 7 },
      { trackIndex: 1, takeLane: "new" },
    ]);
    expect(consoleMock.warn).not.toHaveBeenCalled();
  });
});

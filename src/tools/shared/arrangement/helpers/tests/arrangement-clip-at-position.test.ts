// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { setupCuePointMocksRegistry } from "#src/test/helpers/cue-point-test-helpers.ts";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import {
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  positionPath as at,
  registerBoundaryClips,
  registerMainLaneClip,
  registerSpanningClip,
  registerTakeLaneClip,
  registerTrackClips,
} from "#src/tools/shared/arrangement/tests/helpers/arrangement-lane-clips.ts";
import { arrangementClipAtPosition } from "../arrangement-clip-at-position.ts";
import { MAIN as MAIN_LANE, TAKE as TAKE_LANE } from "./lane-view-fixtures.ts";

const PARAM_NAME = "path";

describe("arrangementClipAtPosition", () => {
  beforeEach(() => {
    clearMockRegistry();
    mockNonExistentObjects();
  });

  // 4/4, so bar 5 is beat 16. The epsilon case is the point of the comparison:
  // a start time Live rounded off still names the clip the caller meant.
  it.each([
    ["exactly", 16],
    ["within the same-time epsilon", 16.0001],
  ])("finds the main-lane clip starting %s there", (_name, startTime) => {
    registerMainLaneClip("clip_main", startTime);
    registerTrackClips("clip_main");

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_main");
  });

  it("finds the clip on the take lane the path names", () => {
    registerTakeLaneClip("clip_take", 16);
    registerTrackClips();

    expect(
      arrangementClipAtPosition(at(TAKE_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_take");
  });

  it("resolves a locator position", () => {
    setupCuePointMocksRegistry({
      cuePoints: [{ id: "cue1", time: 16, name: "Verse" }],
    });
    registerMainLaneClip("clip_main", 16);
    registerTrackClips("clip_main");

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "loc:Verse"), PARAM_NAME)?.id,
    ).toBe("clip_main");
  });

  it("reports a locator that isn't there as a problem with the path", () => {
    setupCuePointMocksRegistry({
      cuePoints: [{ id: "cue1", time: 16, name: "Verse" }],
    });
    registerTrackClips();

    expect(() =>
      arrangementClipAtPosition(at(MAIN_LANE, "loc:Chorus"), PARAM_NAME),
    ).toThrow(
      'invalid path "t0[loc:Chorus]" - no locator found with name "Chorus"',
    );
  });

  it("names nothing when no clip starts there", () => {
    registerMainLaneClip("clip_main", 16);
    registerTrackClips("clip_main");

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "9|1"), PARAM_NAME),
    ).toBeNull();
  });

  // A path is an address, not a "starts at": a clip running from bar 3 through
  // bar 6 is the clip at 5|1.
  it("finds a clip that only spans the position, not starts there", () => {
    registerSpanningClip();

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_long");
  });

  // A clip's end is exclusive: back-to-back clips at the boundary resolve to
  // the one starting there, never the one ending there.
  it("resolves a boundary between two clips to the one starting there", () => {
    registerBoundaryClips();

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_after");
  });

  it("finds a take-lane clip that only spans the position", () => {
    registerMockObject("clip_take_long", {
      path: livePath.track(0).takeLane(1).arrangementClip(0),
      properties: { start_time: 8, end_time: 24 },
    });
    registerMockObject("lane_1", {
      path: livePath.track(0).takeLane(1),
      properties: { arrangement_clips: children("clip_take_long") },
    });
    registerTrackClips();

    expect(
      arrangementClipAtPosition(at(TAKE_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_take_long");
  });

  // The lane is part of the address. Whether Live's own track-level
  // arrangement_clips lists take-lane clips or not, a main-lane path answers
  // with a main-lane clip or nothing.
  it("does not match a take-lane clip from a main-lane path", () => {
    registerTakeLaneClip("clip_take", 16);
    registerTrackClips("clip_take");

    expect(
      arrangementClipAtPosition(at(MAIN_LANE, "5|1"), PARAM_NAME),
    ).toBeNull();
    expect(
      arrangementClipAtPosition(at(TAKE_LANE, "5|1"), PARAM_NAME)?.id,
    ).toBe("clip_take");
  });
});

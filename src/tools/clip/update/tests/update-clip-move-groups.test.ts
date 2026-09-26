// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  deferClipDeletion,
  landedSpans,
  moveGroupKey,
  recordFailedLanding,
  recordLandedClip,
  recordResize,
  writtenSpans,
  type MoveGroup,
} from "../helpers/arrangement/update-clip-move-groups.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";

/**
 * A track's main arrangement lane, where a move with no take lane lands.
 * @param trackIndex - The track
 * @returns The landing
 */
function mainLane(trackIndex: number): ArrangementTrack {
  return { trackIndex, takeLane: null };
}

describe("update-clip-move-groups", () => {
  it("keys a lane and position, take lanes apart from the main one", () => {
    expect(moveGroupKey(mainLane(0), 16)).toBe("t0@16");
    expect(moveGroupKey({ trackIndex: 0, takeLane: 1 }, 16)).toBe("t0/l1@16");
    expect(moveGroupKey(mainLane(0), 32)).not.toBe(
      moveGroupKey(mainLane(0), 16),
    );
  });

  it("collects landings and held-back clips into one group per lane and position", () => {
    const groups = new Map<string, MoveGroup>();
    const result: ClipResult = { id: "held" };

    recordLandedClip(groups, mainLane(0), 16, "source", {
      id: "copy",
      length: 8,
    });
    deferClipDeletion(groups, mainLane(0), 16, {
      clip: LiveAPI.from("held"),
      sourceTrack: LiveAPI.from("track"),
      result,
    });
    recordLandedClip(groups, mainLane(0), 32, "elsewhere", {
      id: "other",
      length: 4,
    });

    expect([...groups.keys()]).toStrictEqual(["t0@16", "t0@32"]);

    const group = groups.get("t0@16") as MoveGroup;

    expect(group.landed.get("source")).toStrictEqual({
      id: "copy",
      span: {
        lane: { kind: "track", trackIndex: 0 },
        start: 16,
        end: 24,
        order: expect.any(Number),
      },
    });
    expect(group.deferred).toHaveLength(1);
  });
});

describe("recordResize", () => {
  /**
   * A main-lane clip on track 0 starting here, 8 beats long.
   * @param start - Its start, in beats, or null when unreadable
   * @returns The clip
   */
  function clipAt(start: number | null): LiveAPI {
    registerMockObject("resized", {
      path: livePath.track(0).arrangementClip(0),
      properties: {
        start_time: start,
        end_time: start == null ? null : start + 8,
      },
    });

    return LiveAPI.from("resized");
  }

  // A lengthen writes past where the copy landed. That write is nobody's own
  // span: the copy keeps the one it landed with.
  it("records a lengthen as a later write, not as the copy's span", () => {
    const groups = new Map<string, MoveGroup>();

    recordLandedClip(groups, mainLane(0), 16, "source", {
      id: "copy",
      length: 8,
    });
    recordResize(groups, clipAt(16), 24);

    const landedAt = landedSpans(groups).get("copy");
    const [, resize] = writtenSpans(groups);

    expect(landedAt?.end).toBe(24);
    expect(resize).toStrictEqual({
      lane: { kind: "track", trackIndex: 0 },
      start: 24,
      end: 40,
      order: expect.any(Number),
    });
    expect(resize?.order).toBeGreaterThan(landedAt?.order as number);
  });

  // A shorten writes only over the tail it cuts off.
  it("records a shorten from the new end to the old one", () => {
    const groups = new Map<string, MoveGroup>();

    recordResize(groups, clipAt(16), 4);

    expect(writtenSpans(groups)).toStrictEqual([
      {
        lane: { kind: "track", trackIndex: 0 },
        start: 20,
        end: 24,
        order: expect.any(Number),
      },
    ]);
  });

  it("takes an unreadable clip's resize as the whole lane", () => {
    const groups = new Map<string, MoveGroup>();

    recordResize(groups, clipAt(null), 4);

    expect(writtenSpans(groups)).toStrictEqual([
      {
        lane: { kind: "track", trackIndex: 0 },
        start: -Infinity,
        end: Infinity,
        order: expect.any(Number),
      },
    ]);
  });

  it("records nothing for a clip on no track", () => {
    const groups = new Map<string, MoveGroup>();

    registerMockObject("nowhere", { path: "" });
    recordResize(groups, LiveAPI.from("nowhere"), 4);

    expect(writtenSpans(groups)).toStrictEqual([]);
  });
});

describe("recordFailedLanding", () => {
  it("records where a failed move may have left a clip", () => {
    const groups = new Map<string, MoveGroup>();

    recordFailedLanding(groups, mainLane(0), 16, 8);
    recordFailedLanding(groups, mainLane(1), 16, null);

    expect(writtenSpans(groups)).toStrictEqual([
      {
        lane: { kind: "track", trackIndex: 0 },
        start: 16,
        end: 24,
        order: expect.any(Number),
      },
      {
        lane: { kind: "track", trackIndex: 1 },
        start: -Infinity,
        end: Infinity,
        order: expect.any(Number),
      },
    ]);
    expect(landedSpans(groups).size).toBe(0);
  });
});

describe("landedSpans", () => {
  it("keys every landing by its copy, in landing order across groups", () => {
    const groups = new Map<string, MoveGroup>();

    recordLandedClip(groups, { trackIndex: 3, takeLane: 1 }, 16, "a", {
      id: "copy-a",
      length: 8,
    });
    recordLandedClip(groups, mainLane(3), 64, "b", { id: "copy-b", length: 4 });

    const spans = landedSpans(groups);

    expect(spans.get("copy-a")).toStrictEqual({
      lane: { kind: "take-lane", trackIndex: 3, laneIndex: 1 },
      start: 16,
      end: 24,
      order: expect.any(Number),
    });
    expect(spans.get("copy-b")?.order).toBeGreaterThan(
      spans.get("copy-a")?.order as number,
    );
  });

  // A length that couldn't be read would put the span in the wrong place.
  it("leaves out a landing whose length is unknown", () => {
    const groups = new Map<string, MoveGroup>();

    recordLandedClip(groups, mainLane(0), 16, "a", {
      id: "copy",
      length: null,
    });

    expect(landedSpans(groups).size).toBe(0);
    expect(writtenSpans(groups)).toStrictEqual([
      {
        lane: { kind: "track", trackIndex: 0 },
        start: -Infinity,
        end: Infinity,
        order: expect.any(Number),
      },
    ]);
  });
});

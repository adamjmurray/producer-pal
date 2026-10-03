// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  newLandingLog,
  recordFailedLanding,
  recordLandedClip,
  recordResize,
  writtenOverBy,
} from "#src/tools/shared/clip/landings/landing-log.ts";

/**
 * A track's main arrangement lane, where a move with no take lane lands.
 * @param trackIndex - The track
 * @returns The landing
 */
function mainLane(trackIndex: number): ArrangementTrack {
  return { trackIndex, takeLane: null };
}

/**
 * The span recorded when a clip's position can't be read: the whole lane.
 * @param trackIndex - The track
 * @returns The expected written span
 */
function wholeLane(trackIndex: number): object {
  return {
    lane: { kind: "track", trackIndex },
    start: -Infinity,
    end: Infinity,
    order: expect.any(Number),
  };
}

describe("recordLandedClip", () => {
  it("keeps a landing by its copy, and counts it as written", () => {
    const log = newLandingLog();

    recordLandedClip(log, mainLane(0), 16, { id: "copy", length: 8 });

    const span = {
      lane: { kind: "track", trackIndex: 0 },
      start: 16,
      end: 24,
      order: expect.any(Number),
    };

    expect(log.landed.get("copy")).toStrictEqual(span);
    expect(log.written).toStrictEqual([span]);
  });

  it("orders landings across lanes, take lanes included", () => {
    const log = newLandingLog();

    recordLandedClip(log, { trackIndex: 3, takeLane: 1 }, 16, {
      id: "copy-a",
      length: 8,
    });
    recordLandedClip(log, mainLane(3), 64, { id: "copy-b", length: 4 });

    expect(log.landed.get("copy-a")).toStrictEqual({
      lane: { kind: "take-lane", trackIndex: 3, laneIndex: 1 },
      start: 16,
      end: 24,
      order: expect.any(Number),
    });
    expect(log.landed.get("copy-b")?.order).toBeGreaterThan(
      log.landed.get("copy-a")?.order as number,
    );
  });

  // A length that couldn't be read would put the span in the wrong place.
  it("leaves out a landing whose length is unknown, and takes the lane as written", () => {
    const log = newLandingLog();

    recordLandedClip(log, mainLane(0), 16, { id: "copy", length: null });

    expect(log.landed.size).toBe(0);
    expect(log.written).toStrictEqual([wholeLane(0)]);
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
    const log = newLandingLog();

    recordLandedClip(log, mainLane(0), 16, { id: "copy", length: 8 });
    recordResize(log, clipAt(16), 24);

    const landedAt = log.landed.get("copy");
    const [, resize] = log.written;

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
    const log = newLandingLog();

    recordResize(log, clipAt(16), 4);

    expect(log.written).toStrictEqual([
      {
        lane: { kind: "track", trackIndex: 0 },
        start: 20,
        end: 24,
        order: expect.any(Number),
      },
    ]);
  });

  it("takes an unreadable clip's resize as the whole lane", () => {
    const log = newLandingLog();

    recordResize(log, clipAt(null), 4);

    expect(log.written).toStrictEqual([wholeLane(0)]);
  });

  it("records nothing for a clip on no track", () => {
    const log = newLandingLog();

    registerMockObject("nowhere", { path: "" });
    recordResize(log, LiveAPI.from("nowhere"), 4);

    expect(log.written).toStrictEqual([]);
  });
});

describe("recordFailedLanding", () => {
  it("records where a failed move may have left a clip", () => {
    const log = newLandingLog();

    recordFailedLanding(log, mainLane(0), 16, 8);
    recordFailedLanding(log, mainLane(1), 16, null);

    expect(log.written).toStrictEqual([
      {
        lane: { kind: "track", trackIndex: 0 },
        start: 16,
        end: 24,
        order: expect.any(Number),
      },
      wholeLane(1),
    ]);
    expect(log.landed.size).toBe(0);
  });
});

describe("writtenOverBy", () => {
  const sat = {
    lane: { kind: "track", trackIndex: 0 },
    start: 16,
    end: 24,
    order: -1,
  } as const;

  it("names where the first later write that reaches into a span landed", () => {
    const log = newLandingLog();

    recordLandedClip(log, mainLane(0), 20, { id: "first", length: 8 });
    recordLandedClip(log, mainLane(0), 16, { id: "second", length: 4 });

    expect(writtenOverBy(sat, log.written)).toBe("t0[6|1]");
  });

  it("leaves out writes on another lane, ones that only share an edge, and ones before it", () => {
    const log = newLandingLog();

    recordLandedClip(log, { trackIndex: 0, takeLane: 1 }, 16, {
      id: "elsewhere",
      length: 8,
    });
    recordLandedClip(log, mainLane(0), 24, { id: "touching", length: 4 });

    expect(writtenOverBy(sat, log.written)).toBeUndefined();
    expect(writtenOverBy({ ...sat, order: 1e9 }, log.written)).toBeUndefined();
  });

  it("names nothing for a span it doesn't know, or a write of the whole lane", () => {
    const log = newLandingLog();

    recordLandedClip(log, mainLane(0), 16, { id: "unread", length: null });

    expect(writtenOverBy(undefined, log.written)).toBeUndefined();
    expect(writtenOverBy(sat, log.written)).toBeUndefined();
  });
});

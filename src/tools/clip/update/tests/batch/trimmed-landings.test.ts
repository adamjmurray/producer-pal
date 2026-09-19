// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Where a stack of landings leaves each clip. The whole-call behavior is in
// update-clip-buried-clips.test.ts; this covers the arithmetic on its own.

import { describe, expect, it } from "vitest";
import {
  forgetLandedLength,
  type LandedClip,
  type MoveGroup,
  moveGroupKey,
} from "#src/tools/clip/update/helpers/arrangement/update-clip-move-groups.ts";
import { trimmedLandings } from "#src/tools/clip/update/helpers/batch/trimmed-landings.ts";

/** Where every group in these tests lands. */
const START_BEATS = 64;

/**
 * One group of landings on a lane and position.
 * @param takeLane - The take lane they land on, or null for the main lane
 * @param landed - What each clip's placement landed, by source id
 * @returns The group, keyed the way the call keys it
 */
function groupOf(
  takeLane: number | null,
  landed: Array<[string, LandedClip]>,
): Map<string, MoveGroup> {
  const landing = { trackIndex: 3, takeLane };

  return new Map([
    [
      moveGroupKey(landing, START_BEATS),
      {
        landing,
        startBeats: START_BEATS,
        count: landed.length,
        landed: new Map(landed),
        deferred: [],
      },
    ],
  ]);
}

describe("trimmedLandings", () => {
  it("puts a remainder past the longest landing after it", () => {
    const trims = trimmedLandings(
      groupOf(null, [
        ["a", { id: "copy-a", length: 16 }],
        ["b", { id: "copy-b", length: 8 }],
        ["c", { id: "copy-c", length: 2 }],
      ]),
    );

    expect([...trims]).toStrictEqual([
      [
        "copy-b",
        { lane: { kind: "track", trackIndex: 3 }, beats: 66, end: 72 },
      ],
      [
        "copy-a",
        { lane: { kind: "track", trackIndex: 3 }, beats: 72, end: 80 },
      ],
    ]);
  });

  it("names the take lane a stack landed on", () => {
    const trims = trimmedLandings(
      groupOf(1, [
        ["a", { id: "copy-a", length: 16 }],
        ["b", { id: "copy-b", length: 4 }],
      ]),
    );

    expect(trims.get("copy-a")).toStrictEqual({
      lane: { kind: "take-lane", trackIndex: 3, laneIndex: 1 },
      beats: 68,
      end: 80,
    });
  });

  it("leaves a landing a later one buried whole to the read-back", () => {
    const trims = trimmedLandings(
      groupOf(null, [
        ["a", { id: "copy-a", length: 8 }],
        ["b", { id: "copy-b", length: 8 }],
      ]),
    );

    expect(trims.size).toBe(0);
  });

  // The length was read as the copy landed, so a resize afterwards leaves it
  // describing a clip that no longer ends there.
  it("leaves the group alone once a resize moved a landing's end", () => {
    const groups = groupOf(null, [
      ["a", { id: "copy-a", length: 16 }],
      ["b", { id: "copy-b", length: 4 }],
    ]);

    forgetLandedLength(groups, "never-landed");

    expect(trimmedLandings(groups).size).toBe(1);

    forgetLandedLength(groups, "a");

    expect(trimmedLandings(groups).size).toBe(0);
  });

  // A length that couldn't be read would put the remainder in the wrong place,
  // where the read-back could find someone else's clip.
  it("leaves the whole group alone when a length is unknown", () => {
    const trims = trimmedLandings(
      groupOf(null, [
        ["a", { id: "copy-a", length: 16 }],
        ["b", { id: "copy-b", length: null }],
      ]),
    );

    expect(trims.size).toBe(0);
  });
});

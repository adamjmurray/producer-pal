// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type ArrangementTrack } from "#src/tools/shared/arrangement/helpers/take-lanes.ts";
import {
  deferClipDeletion,
  forgetLandedLength,
  moveGroupKey,
  recordLandedClip,
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
      length: 8,
    });
    expect(group.deferred).toHaveLength(1);
  });

  // A resize after the copy landed makes the recorded length a lie, and the
  // trim look-up would then describe the wrong clip.
  it("forgets a landing's length once the call resized it", () => {
    const groups = new Map<string, MoveGroup>();

    recordLandedClip(groups, mainLane(0), 16, "source", {
      id: "copy",
      length: 8,
    });
    forgetLandedLength(groups, "source");

    expect(
      (groups.get("t0@16") as MoveGroup).landed.get("source")?.length,
    ).toBeNull();
  });
});

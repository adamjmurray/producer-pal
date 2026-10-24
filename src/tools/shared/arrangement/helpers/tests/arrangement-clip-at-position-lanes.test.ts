// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Looking up several paths against one call's lanes: the same answers as a
// lookup of its own, from one read of each lane.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  lookupMockObject,
  clearMockRegistry,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";
import {
  positionPath as at,
  registerBoundaryClips,
  registerMainLaneClip,
  registerSpanningClip,
  registerTakeLaneClip,
  registerTrackClips,
} from "#src/tools/shared/arrangement/tests/helpers/arrangement-lane-clips.ts";
import {
  arrangementClipAtPosition,
  arrangementPositionTarget,
} from "../arrangement-clip-at-position.ts";
import { LaneView } from "../arrangement-lane-view.ts";
import { MAIN, TAKE } from "./lane-view-fixtures.ts";

describe("arrangementClipAtPosition on a call's lanes", () => {
  beforeEach(() => {
    clearMockRegistry();
    mockNonExistentObjects();
  });

  // 4/4, so bar 5 is beat 16.
  it("finds the clip starting at the position", () => {
    registerMainLaneClip("clip_main", 16);
    registerTrackClips("clip_main");

    expect(
      arrangementClipAtPosition(at(MAIN, "5|1"), "path", new LaneView())?.id,
    ).toBe("clip_main");
  });

  it("finds a clip that only spans the position, and names nothing where none does", () => {
    registerSpanningClip();

    const lanes = new LaneView();

    expect(arrangementClipAtPosition(at(MAIN, "5|1"), "path", lanes)?.id).toBe(
      "clip_long",
    );
    expect(
      arrangementClipAtPosition(at(MAIN, "9|1"), "path", lanes),
    ).toBeNull();
  });

  it("resolves a boundary between two clips to the one starting there", () => {
    registerBoundaryClips();

    expect(
      arrangementClipAtPosition(at(MAIN, "5|1"), "path", new LaneView())?.id,
    ).toBe("clip_after");
  });

  it("keeps a main-lane path off a take-lane clip", () => {
    registerTakeLaneClip("clip_take", 16);
    registerTrackClips("clip_take");

    const lanes = new LaneView();

    expect(
      arrangementClipAtPosition(at(MAIN, "5|1"), "path", lanes),
    ).toBeNull();
    expect(arrangementClipAtPosition(at(TAKE, "5|1"), "path", lanes)?.id).toBe(
      "clip_take",
    );
  });

  it("gives the position in beats with the clip", () => {
    registerMainLaneClip("clip_main", 16);
    registerTrackClips("clip_main");

    const target = arrangementPositionTarget(
      at(MAIN, "5|1"),
      "path",
      new LaneView(),
    );

    expect(target.beats).toBe(16);
    expect(target.clip?.id).toBe("clip_main");
  });

  it("reads a lane once for any number of paths, and builds only the clip it finds", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `clip${i}`);

    for (const [index, id] of ids.entries()) {
      registerMainLaneClip(id, index * 8, index);
    }

    registerTrackClips(...ids);

    const lanes = new LaneView();
    const from = vi.spyOn(LiveAPI, "from");
    const found = [5, 9, 13].map((bar) =>
      arrangementClipAtPosition(at(MAIN, `${bar}|1`), "path", lanes),
    );

    expect(found.map((clip) => clip?.id)).toStrictEqual([
      "clip2",
      "clip4",
      "clip6",
    ]);
    // Each clip is built once for the one scan, and the three found again.
    expect(
      from.mock.calls.filter(([id]) => String(id).startsWith("id clip")),
    ).toHaveLength(ids.length + found.length);
    expect(
      ids.map((id) => lookupMockObject(id)?.get.mock.calls.length),
    ).toStrictEqual(ids.map(() => 2));
  });
});

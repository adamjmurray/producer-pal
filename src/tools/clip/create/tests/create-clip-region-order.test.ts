// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, type Mock, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { createClip } from "../create-clip.ts";
import {
  setupArrangementClipMocks,
  setupSessionMocks,
} from "./create-clip-test-helpers.ts";

const MARKERS = new Set([
  "start_marker",
  "loop_start",
  "loop_end",
  "end_marker",
]);

// A region from 1|1-n/2 for n/4 spans beats -2 to -1: the starts move first.
const WRITES_BEFORE_1_1 = [
  ["start_marker", -2],
  ["loop_start", -2],
  ["loop_end", -1],
  ["end_marker", -1],
];

/**
 * The marker writes a clip received, in order.
 * @param set - The clip's mocked set()
 * @returns Each marker write as [property, value]
 */
function markerWrites(set: Mock): unknown[][] {
  return set.mock.calls.filter(([prop]) => MARKERS.has(prop as string));
}

// Live rejects a loop_start past loop_end and drops a start_marker past
// end_marker, and a new clip's markers run from 0 to the length it was created
// with. These pin the order that keeps every write.
describe("createClip - region write order", () => {
  it("writes the starts first when they fall inside the new clip", async () => {
    const { track, clip } = setupArrangementClipMocks();

    await createClip({ path: "t0[3|1]", start: "1|2", length: "1bar" });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 8, 4);
    expect(markerWrites(clip.set)).toStrictEqual([
      ["start_marker", 1],
      ["loop_start", 1],
      ["loop_end", 5],
      ["end_marker", 5],
    ]);
  });

  it("moves the ends first when start is at the region's length", async () => {
    // Created 4 beats long, so a start of beat 4 sits on the current end.
    const { track, clip } = setupArrangementClipMocks();

    await createClip({
      path: "t0[3|1]",
      start: "2|1",
      length: "1bar",
      notes: "C3 2|1",
    });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 8, 4);
    expect(markerWrites(clip.set)).toStrictEqual([
      ["loop_end", 8],
      ["end_marker", 8],
      ["start_marker", 4],
      ["loop_start", 4],
    ]);
  });

  it("writes the starts first for a region before 1|1", async () => {
    // The new end (-1) is before the clip's current start (0), so moving it
    // first would be rejected.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { track, clip } = setupArrangementClipMocks();

    await createClip({ path: "t0[3|1]", start: "1|1-n/2", length: "n/4" });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 8, 1);
    expect(markerWrites(clip.set)).toStrictEqual(WRITES_BEFORE_1_1);
  });

  it("creates a session clip only as long as its region", async () => {
    // Created to the region's end, a region before 1|1 would ask Live for a
    // clip of negative length, and Live makes none.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { clipSlot, clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({ slot: "0/0", start: "1|1-n/2", length: "n/4" });

    expect(clipSlot.call).toHaveBeenCalledWith("create_clip", 1);
    expect(markerWrites(clip.set)).toStrictEqual(WRITES_BEFORE_1_1);
  });
});

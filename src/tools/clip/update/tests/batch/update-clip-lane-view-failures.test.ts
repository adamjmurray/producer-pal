// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A write that throws after it changed a lane leaves nothing to read the lane
// back, so the call's lane view must not keep the spans from before it. A later
// clear in the same call would otherwise miss an overlap, which crashes Live.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupMockObject } from "#src/test/mocks/mock-registry.ts";
import { handleArrangementLengthOperation } from "#src/tools/clip/arrangement/arrangement-operations.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { clearArrangementRange } from "#src/tools/shared/arrangement/arrangement-tiling-workaround.ts";
import { LaneView } from "#src/tools/shared/arrangement/helpers/arrangement-lane-view.ts";
import { handleArrangementStartOperation } from "../../helpers/arrangement/arrangement-move.ts";
import { newClipReasons } from "../../helpers/entries/clip-reasons.ts";
import {
  registerStackingTrack,
  stackedLaneSpans,
} from "./stacking-track-test-helpers.ts";
import { newLandingLog } from "#src/tools/shared/clip/landings/landing-log.ts";

const MAIN = { kind: "track", trackIndex: 0 } as const;

/**
 * Make an unlooped MIDI clip that grows over its neighbour when its end marker
 * is set, and then throws when its loop end is.
 * @param id - The clip
 * @param grownEnd - Where it ends once the end marker is set
 */
function growThenThrow(id: string, grownEnd: number): void {
  Object.assign(lookupMockObject(id)?.properties ?? {}, {
    looping: 0,
    loop_start: 0,
    loop_end: 4,
    start_marker: 0,
    end_marker: 4,
  });
  lookupMockObject(id)?.set.mockImplementation((property: string) => {
    if (property === "end_marker") {
      // A neighbour's front is trimmed where it stands, keeping its id.
      const next = Object.values(laneProps()).find(
        (props) => props.start_time === 8,
      );

      if (next != null) {
        next.start_time = grownEnd;
      }

      (lookupMockObject(id)?.properties ?? {}).end_time = grownEnd;
    }

    if (property === "loop_end") {
      throw new Error("Live refused loop_end");
    }
  });
}

/** @returns The properties of every clip on the track */
function laneProps(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    ["clip1", "clip2", "clip3", "clip4"].map((id) => [
      id,
      lookupMockObject(id)?.properties ?? {},
    ]),
  );
}

describe("a lane view after a write that threw", () => {
  let ids: string[];
  let lanes: LaneView;
  const context = (): { silenceWavPath: string; lanes: LaneView } => ({
    silenceWavPath: "/tmp/test-silence.wav",
    lanes,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // clip1 [0, 4], clip2 [8, 12], clip3 [16, 20], clip4 [24, 28].
    ids = registerStackingTrack([4, 4, 4, 4]);
    lanes = new LaneView();
    lanes.clips(MAIN);
  });

  it("forgets the lane when a lengthening throws after the clip grew", () => {
    growThenThrow(ids[0] as string, 10);

    expect(() =>
      handleArrangementLengthOperation({
        clip: LiveAPI.from(ids[0] as string),
        isAudioClip: false,
        arrangementLengthBeats: 10,
        context: context(),
        reasons: newClipReasons(),
      }),
    ).toThrow("Live refused loop_end");

    // What the view knows is what Live holds now.
    expect(lanes.clips(MAIN).slice(0, 2)).toStrictEqual([
      { id: ids[0], start: 0, end: 10 },
      { id: ids[1], start: 10, end: 12 },
    ]);
  });

  it("clears the grown clip's new ground in the same call", async () => {
    growThenThrow(ids[0] as string, 10);

    const track = lookupMockObject("stacking-track");
    const result = await updateClip(
      { id: ids[0] as string, arrangementLength: "3bar" },
      context(),
    ).catch((error: unknown) => error);

    expect(String(result)).toContain("Live refused loop_end");

    track?.call.mockClear();
    clearArrangementRange(
      LiveAPI.from("live_set tracks 0"),
      9,
      11,
      true,
      context(),
    );

    // The clip really reaches 10 now, so its tail is trimmed off.
    expect(track?.call.mock.calls).toContainEqual(["create_midi_clip", 9, 1]);
  });

  it("forgets the lane when a move throws after its landing cleared ground", () => {
    const track = lookupMockObject("stacking-track");

    // The duplicate trims the clip at 24 as it lands, then fails.
    (
      track as unknown as { methods: Record<string, unknown> }
    ).methods.duplicate_clip_to_arrangement = () => {
      Object.assign(lookupMockObject(ids[3] as string)?.properties ?? {}, {
        start_time: 26,
      });
      throw new Error("Live refused the copy");
    };

    expect(() =>
      handleArrangementStartOperation({
        clip: LiveAPI.from(ids[0] as string),
        arrangementStartBeats: 20,
        destination: null,
        landings: newLandingLog(),
        isMidiClip: true,
        context: context(),
        reasons: newClipReasons(),
      }),
    ).toThrow("Live refused the copy");

    expect(lanes.clips(MAIN).find(({ id }) => id === ids[3])?.start).toBe(26);
    expect(stackedLaneSpans().at(-1)).toStrictEqual([26, 28]);
  });
});

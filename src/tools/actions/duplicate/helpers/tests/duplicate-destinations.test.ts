// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  hasArrangementPosition,
  inferDestination,
  resolveDestinationTargets,
} from "../duplicate-destinations.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("hasArrangementPosition", () => {
  it("reads a real position", () => {
    expect(hasArrangementPosition("1|1")).toBe(true);
  });

  it("treats a whitespace-only arrangementStart as absent", () => {
    // The `.trim() !== ""` guard: "   " must NOT be read as an arrangement start.
    expect(hasArrangementPosition("   ")).toBe(false);
    expect(hasArrangementPosition(undefined)).toBe(false);
  });
});

describe("inferDestination", () => {
  it("returns 'arrangement' when a position is given", () => {
    expect(inferDestination("scene", "1|1")).toBe("arrangement");
  });

  it("returns undefined for a device", () => {
    expect(inferDestination("device", undefined)).toBeUndefined();
  });

  it("defaults tracks and scenes to session", () => {
    expect(inferDestination("track", undefined)).toBe("session");
    expect(inferDestination("track", "   ")).toBe("session");
    expect(inferDestination("scene", undefined)).toBe("session");
  });
});

describe("resolveDestinationTargets", () => {
  /**
   * Register a source clip mock on a track.
   * @param trackIndex - Track the clip lives on, or null for an orphan clip
   * @param isMidi - Whether the clip is a MIDI clip
   * @returns The clip's LiveAPI instance
   */
  function sourceClip(trackIndex: number | null, isMidi = true): LiveAPI {
    registerMockObject("src_clip", {
      path:
        trackIndex == null
          ? "live_set scenes 0"
          : `${livePath.track(trackIndex)} arrangement_clips 0`,
      type: "Clip",
      properties: { is_midi_clip: isMidi ? 1 : 0 },
    });

    return LiveAPI.from("src_clip");
  }

  /**
   * Register a destination track mock.
   * @param trackIndex - Track index to register
   * @param isMidi - Whether the track takes MIDI input
   * @param isFrozen - Whether the track is frozen
   */
  function destTrack(
    trackIndex: number,
    isMidi = true,
    isFrozen = false,
  ): void {
    registerMockObject(`dest_track_${String(trackIndex)}`, {
      path: livePath.track(trackIndex).toString(),
      type: "Track",
      properties: {
        has_midi_input: isMidi ? 1 : 0,
        is_frozen: isFrozen ? 1 : 0,
      },
    });
  }

  /**
   * A main-lane destination on a track.
   * @param trackIndex - Track index
   * @returns The destination
   */
  function mainLane(trackIndex: number) {
    return { trackIndex, takeLane: null };
  }

  it("falls back to the source clip's own track when no track is named", () => {
    expect(resolveDestinationTargets(sourceClip(3), [])).toStrictEqual([
      mainLane(3),
    ]);
  });

  it("throws when the source clip has no track index and none was named", () => {
    expect(() => resolveDestinationTargets(sourceClip(null), [])).toThrow(
      /no track index for clip id/,
    );
  });

  it("returns the named tracks when they exist and types match", () => {
    const clip = sourceClip(3);

    destTrack(7);
    destTrack(8);

    expect(
      resolveDestinationTargets(clip, [mainLane(7), mainLane(8)]),
    ).toStrictEqual([mainLane(7), mainLane(8)]);
  });

  it("marks a toPath entry naming a track that does not exist", () => {
    const clip = sourceClip(3);

    mockNonExistentObjects();

    expect(resolveDestinationTargets(clip, [mainLane(99)])).toStrictEqual([
      null,
    ]);
    expect(capturedWarnings()).toContain('no track at toPath "t99"');
  });

  it("marks a track a MIDI clip can't go to", () => {
    // Live's duplicate_clip_to_arrangement silently no-ops on a mismatch, so a
    // reported success here would be a lie.
    const clip = sourceClip(3, true);

    destTrack(5, false);

    expect(resolveDestinationTargets(clip, [mainLane(5)])).toStrictEqual([
      null,
    ]);
    expect(capturedWarnings()).toContain(
      "clip t3[1|1] (id src_clip) was not duplicated: track t5 (id dest_track_5) is audio; a MIDI clip needs a MIDI track",
    );
  });

  it("marks a frozen track, which Live refuses the copy to", () => {
    // Live returns success and copies nothing onto a frozen track, so a
    // matching type is not enough to let the copy through.
    const clip = sourceClip(3, true);

    destTrack(6, true, true);

    expect(resolveDestinationTargets(clip, [mainLane(6)])).toStrictEqual([
      null,
    ]);
    expect(capturedWarnings()).toContain(
      "clip t3[1|1] (id src_clip) was not duplicated: track t6 (id dest_track_6) is frozen; unfreeze it first",
    );
  });

  it("marks a track an audio clip can't go to", () => {
    const clip = sourceClip(4, false);

    destTrack(8, true);

    expect(resolveDestinationTargets(clip, [mainLane(8)])).toStrictEqual([
      null,
    ]);
    expect(capturedWarnings()).toContain(
      "clip t4[1|1] (id src_clip) was not duplicated: track t8 (id dest_track_8) is MIDI; an audio clip needs an audio track",
    );
  });

  it("keeps the tracks that work when one of them doesn't", () => {
    // One bad entry in a comma-separated toPath must not cost the good ones.
    const clip = sourceClip(3, true);

    destTrack(7, true);
    destTrack(5, false);

    // The gap stays: name and color are counted per requested destination.
    expect(
      resolveDestinationTargets(clip, [mainLane(7), mainLane(5)]),
    ).toStrictEqual([mainLane(7), null]);
    expect(capturedWarnings()).toContain(
      "clip t3[1|1] (id src_clip) was not duplicated: track t5 (id dest_track_5) is audio; a MIDI clip needs a MIDI track",
    );
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  hasArrangementPosition,
  inferDestination,
  resolveDestinationTrackIndices,
  validateAndConfigureRouteToSource,
  validateArrangementParameters,
} from "../duplicate-validation-helpers.ts";

describe("validateAndConfigureRouteToSource", () => {
  it("returns the user values unchanged when routeToSource is falsy", () => {
    expect(
      validateAndConfigureRouteToSource("track", false, false, true),
    ).toStrictEqual({ withoutClips: false, withoutDevices: true });
    expect(
      validateAndConfigureRouteToSource(
        "track",
        undefined,
        undefined,
        undefined,
      ),
    ).toStrictEqual({ withoutClips: undefined, withoutDevices: undefined });
  });

  it("throws when routeToSource is used with a non-track type", () => {
    expect(() =>
      validateAndConfigureRouteToSource("scene", true, undefined, undefined),
    ).toThrow("routeToSource is only supported for type 'track'");
  });

  it("forces withoutClips/withoutDevices to true and warns when the user passed false", () => {
    const warnSpy = vi.spyOn(console, "warn");

    const result = validateAndConfigureRouteToSource(
      "track",
      true,
      false,
      false,
    );

    // Returned config is forced to true for both, regardless of the user's false.
    expect(result).toStrictEqual({ withoutClips: true, withoutDevices: true });
    expect(warnSpy).toHaveBeenCalledWith(
      "routeToSource requires withoutClips=true, ignoring user-provided withoutClips=false",
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "routeToSource requires withoutDevices=true, ignoring user-provided withoutDevices=false",
    );
  });

  it("does not warn when withoutClips/withoutDevices are not explicitly false", () => {
    const warnSpy = vi.spyOn(console, "warn");

    const result = validateAndConfigureRouteToSource(
      "track",
      true,
      true,
      undefined,
    );

    expect(result).toStrictEqual({ withoutClips: true, withoutDevices: true });
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("ignoring user-provided withoutClips"),
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("ignoring user-provided withoutDevices"),
    );
  });
});

describe("hasArrangementPosition", () => {
  it("reads a real position from either param", () => {
    expect(hasArrangementPosition("1|1", undefined)).toBe(true);
    expect(hasArrangementPosition(undefined, "Verse")).toBe(true);
  });

  it("treats a whitespace-only arrangementStart as absent", () => {
    // The `.trim() !== ""` guard: "   " must NOT be read as an arrangement start.
    expect(hasArrangementPosition("   ", undefined)).toBe(false);
    expect(hasArrangementPosition(undefined, undefined)).toBe(false);
  });
});

describe("inferDestination", () => {
  it("returns 'arrangement' when a position is given", () => {
    expect(inferDestination("scene", "1|1", undefined)).toBe("arrangement");
    expect(inferDestination("scene", undefined, "Verse")).toBe("arrangement");
  });

  it("returns undefined for a device", () => {
    expect(inferDestination("device", undefined, undefined)).toBeUndefined();
  });

  it("defaults tracks and scenes to session", () => {
    expect(inferDestination("track", undefined, undefined)).toBe("session");
    expect(inferDestination("track", "   ", undefined)).toBe("session");
    expect(inferDestination("scene", undefined, undefined)).toBe("session");
  });
});

describe("resolveDestinationTrackIndices", () => {
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
   */
  function destTrack(trackIndex: number, isMidi = true): void {
    registerMockObject(`dest_track_${String(trackIndex)}`, {
      path: livePath.track(trackIndex).toString(),
      type: "Track",
      properties: { has_midi_input: isMidi ? 1 : 0 },
    });
  }

  it("falls back to the source clip's own track when no track is named", () => {
    expect(resolveDestinationTrackIndices(sourceClip(3), [])).toStrictEqual([
      3,
    ]);
  });

  it("throws when the source clip has no track index and none was named", () => {
    expect(() => resolveDestinationTrackIndices(sourceClip(null), [])).toThrow(
      /no track index for clip id/,
    );
  });

  it("returns the named tracks when they exist and types match", () => {
    const clip = sourceClip(3);

    destTrack(7);
    destTrack(8);

    expect(resolveDestinationTrackIndices(clip, [7, 8])).toStrictEqual([7, 8]);
  });

  it("throws when toPath names a track that does not exist", () => {
    const clip = sourceClip(3);

    mockNonExistentObjects();

    expect(() => resolveDestinationTrackIndices(clip, [99])).toThrow(
      'duplicate failed: no track at toPath "t99"',
    );
  });

  it("throws when a MIDI clip targets an audio track", () => {
    // Live's duplicate_clip_to_arrangement silently no-ops on a mismatch, so a
    // reported success here would be a lie.
    const clip = sourceClip(3, true);

    destTrack(5, false);

    expect(() => resolveDestinationTrackIndices(clip, [5])).toThrow(
      "MIDI clip cannot be duplicated to audio track 5",
    );
  });

  it("throws when an audio clip targets a MIDI track", () => {
    const clip = sourceClip(4, false);

    destTrack(8, true);

    expect(() => resolveDestinationTrackIndices(clip, [8])).toThrow(
      "audio clip cannot be duplicated to MIDI track 8",
    );
  });

  it("checks every named track, not just the first", () => {
    const clip = sourceClip(3, true);

    destTrack(7, true);
    destTrack(5, false);

    expect(() => resolveDestinationTrackIndices(clip, [7, 5])).toThrow(
      "MIDI clip cannot be duplicated to audio track 5",
    );
  });
});

describe("validateArrangementParameters", () => {
  it("does nothing when destination is not arrangement", () => {
    // Even with both start and locator present, a non-arrangement destination
    // must return early without throwing.
    expect(() =>
      validateArrangementParameters("session", "1|1", "Verse"),
    ).not.toThrow();
  });

  it("throws when both arrangementStart and locator are given", () => {
    expect(() =>
      validateArrangementParameters("arrangement", "1|1", "Verse"),
    ).toThrow("arrangementStart and locator are mutually exclusive");
  });

  it("treats a whitespace-only arrangementStart as absent (no conflict with locator)", () => {
    // The `.trim() !== ""` guard: "   " is not a real start, so pairing it with
    // a locator must NOT trip the mutual-exclusivity throw.
    expect(() =>
      validateArrangementParameters("arrangement", "   ", "Verse"),
    ).not.toThrow();
  });

  it("accepts arrangementStart alone", () => {
    expect(() =>
      validateArrangementParameters("arrangement", "1|1", undefined),
    ).not.toThrow();
  });
});

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
  inferDestination,
  resolveDestinationTrackIndex,
  validateAndConfigureRouteToSource,
  validateArrangementParameters,
  validateClipParameters,
  validateDestinationTrackParameters,
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

describe("inferDestination", () => {
  it("returns 'arrangement' when arrangementStart is a real position", () => {
    expect(inferDestination("clip", "1|1", undefined, undefined)).toBe(
      "arrangement",
    );
  });

  it("treats a whitespace-only arrangementStart as no arrangement params", () => {
    // The `.trim() !== ""` guard: "   " must NOT be read as an arrangement start.
    expect(inferDestination("clip", "   ", undefined, "0/0")).toBe("session");
    expect(inferDestination("track", "   ", undefined, undefined)).toBe(
      "session",
    );
  });

  it("returns 'arrangement' when a locator is given", () => {
    expect(inferDestination("clip", undefined, "Verse", undefined)).toBe(
      "arrangement",
    );
  });

  it("returns 'session' for a clip only when toSlot is present, else undefined", () => {
    expect(inferDestination("clip", undefined, undefined, "0/0")).toBe(
      "session",
    );
    expect(
      inferDestination("clip", undefined, undefined, undefined),
    ).toBeUndefined();
  });

  it("returns undefined for a device", () => {
    expect(
      inferDestination("device", undefined, undefined, undefined),
    ).toBeUndefined();
  });

  it("defaults tracks and scenes to session", () => {
    expect(inferDestination("track", undefined, undefined, undefined)).toBe(
      "session",
    );
    expect(inferDestination("scene", undefined, undefined, undefined)).toBe(
      "session",
    );
  });
});

describe("validateClipParameters", () => {
  it("does nothing for non-clip types", () => {
    expect(() =>
      validateClipParameters("track", undefined, undefined),
    ).not.toThrow();
  });

  it("throws when a clip has no resolved destination", () => {
    expect(() => validateClipParameters("clip", undefined, undefined)).toThrow(
      "clip requires toSlot",
    );
  });

  it("throws when a session clip is missing toSlot (whitespace only)", () => {
    expect(() => validateClipParameters("clip", "session", "  ")).toThrow(
      "toSlot is required for session clips",
    );
  });

  it("accepts a session clip with a real toSlot", () => {
    expect(() =>
      validateClipParameters("clip", "session", "0/0"),
    ).not.toThrow();
  });

  it("accepts an arrangement clip with no toSlot", () => {
    expect(() =>
      validateClipParameters("clip", "arrangement", undefined),
    ).not.toThrow();
  });
});

describe("validateDestinationTrackParameters", () => {
  it("throws when a clip is given toPath, naming the params that work", () => {
    // toPath used to be dropped in silence, degrading a cross-track copy into a
    // duplicate onto the source's own track (which overwrites it at the same
    // position). The message has to point at toTrack/toSlot instead.
    expect(() =>
      validateDestinationTrackParameters(
        "clip",
        "arrangement",
        undefined,
        "t2",
        undefined,
      ),
    ).toThrow(/toPath is for devices.*toTrack \(arrangement\) or toSlot/s);
  });

  it("throws when an arrangement clip is given toSlot", () => {
    expect(() =>
      validateDestinationTrackParameters(
        "clip",
        "arrangement",
        "2/0",
        undefined,
        undefined,
      ),
    ).toThrow(/toSlot is for session destinations.*use toTrack/s);
  });

  it("leaves toPath alone for devices and toSlot alone for session clips", () => {
    expect(() =>
      validateDestinationTrackParameters(
        "device",
        undefined,
        undefined,
        "t1/d0",
        undefined,
      ),
    ).not.toThrow();
    expect(() =>
      validateDestinationTrackParameters(
        "clip",
        "session",
        "2/0",
        undefined,
        undefined,
      ),
    ).not.toThrow();
  });

  it("warns and ignores toTrack for non-clip types", () => {
    const warnSpy = vi.spyOn(console, "warn");

    expect(() =>
      validateDestinationTrackParameters(
        "scene",
        "arrangement",
        undefined,
        undefined,
        2,
      ),
    ).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'toTrack ignored: only supported for clips (type "scene")',
    );
  });

  it("throws when toTrack is paired with a session destination", () => {
    expect(() =>
      validateDestinationTrackParameters(
        "clip",
        "session",
        "2/0",
        undefined,
        2,
      ),
    ).toThrow(/toTrack is for arrangement destinations/);
  });

  it("accepts toTrack on an arrangement clip", () => {
    expect(() =>
      validateDestinationTrackParameters(
        "clip",
        "arrangement",
        undefined,
        undefined,
        2,
      ),
    ).not.toThrow();
  });
});

describe("resolveDestinationTrackIndex", () => {
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

  it("falls back to the source clip's own track when toTrack is omitted", () => {
    expect(resolveDestinationTrackIndex(sourceClip(3), undefined)).toBe(3);
  });

  it("throws when the source clip has no track index and toTrack is omitted", () => {
    expect(() =>
      resolveDestinationTrackIndex(sourceClip(null), undefined),
    ).toThrow(/no track index for clip id/);
  });

  it("returns toTrack when the destination exists and types match", () => {
    const clip = sourceClip(3);

    destTrack(7);

    expect(resolveDestinationTrackIndex(clip, 7)).toBe(7);
  });

  it("throws when toTrack names a track that does not exist", () => {
    const clip = sourceClip(3);

    mockNonExistentObjects();

    expect(() => resolveDestinationTrackIndex(clip, 99)).toThrow(
      "duplicate failed: no track at toTrack 99",
    );
  });

  it("throws when a MIDI clip targets an audio track", () => {
    // Live's duplicate_clip_to_arrangement silently no-ops on a mismatch, so a
    // reported success here would be a lie.
    const clip = sourceClip(3, true);

    destTrack(5, false);

    expect(() => resolveDestinationTrackIndex(clip, 5)).toThrow(
      "MIDI clip cannot be duplicated to audio track 5",
    );
  });

  it("throws when an audio clip targets a MIDI track", () => {
    const clip = sourceClip(4, false);

    destTrack(8, true);

    expect(() => resolveDestinationTrackIndex(clip, 8)).toThrow(
      "audio clip cannot be duplicated to MIDI track 8",
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

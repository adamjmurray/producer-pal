// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type MockObjectHandle,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { MAX_AUTO_CREATED_TRACKS } from "#src/tools/constants.ts";
import { createTrack } from "./create-track.ts";

vi.mock(import("#src/shared/v8-max-console.ts"), () => ({
  log: vi.fn(),
  warn: vi.fn(),
}));

describe("createTrack", () => {
  let liveSet: MockObjectHandle;
  let returnTrackCounter = 0;

  beforeEach(() => {
    returnTrackCounter = 0;
    liveSet = registerMockObject("liveSet", {
      path: "live_set",
      properties: {
        tracks: children("existing1", "existing2"),
        return_tracks: children("returnA", "returnB"),
      },
      methods: {
        create_midi_track: (index: unknown) => [
          "id",
          `midi_track_${String(index)}`,
        ],
        create_audio_track: (index: unknown) => [
          "id",
          `audio_track_${String(index)}`,
        ],
        create_return_track: () => [
          "id",
          `return_track_${returnTrackCounter++}`,
        ],
      },
    });
  });

  it("should create a single MIDI track at the specified index", () => {
    const track = registerMockObject("midi_track_1", {});

    const result = createTrack({
      trackIndex: 1,
      name: "New MIDI Track",
      color: "#FF0000",
    });

    expect(liveSet.call).toHaveBeenCalledWith("create_midi_track", 1);
    expect(track.set).toHaveBeenCalledWith("name", "New MIDI Track");
    expect(track.set).toHaveBeenCalledWith("color", 16711680);
    expect(result).toStrictEqual({
      id: "midi_track_1",
      trackIndex: 1,
    });
  });

  it("should create a single audio track when type is audio", () => {
    const track = registerMockObject("audio_track_0", {});

    const result = createTrack({
      trackIndex: 0,
      type: "audio",
      name: "New Audio Track",
    });

    expect(liveSet.call).toHaveBeenCalledWith("create_audio_track", 0);
    expect(track.set).toHaveBeenCalledWith("name", "New Audio Track");
    expect(result).toStrictEqual({
      id: "audio_track_0",
      trackIndex: 0,
    });
  });

  it("should create multiple tracks with auto-incrementing names", () => {
    const t2 = registerMockObject("midi_track_2", {});
    const t3 = registerMockObject("midi_track_3", {});
    const t4 = registerMockObject("midi_track_4", {});

    const result = createTrack({
      trackIndex: 2,
      count: 3,
      name: "Drum",
      color: "#00FF00",
    });

    expect(liveSet.call).toHaveBeenNthCalledWith(1, "create_midi_track", 2);
    expect(liveSet.call).toHaveBeenNthCalledWith(2, "create_midi_track", 3);
    expect(liveSet.call).toHaveBeenNthCalledWith(3, "create_midi_track", 4);

    expect(t2.set).toHaveBeenCalledWith("name", "Drum");
    expect(t3.set).toHaveBeenCalledWith("name", "Drum 2");
    expect(t4.set).toHaveBeenCalledWith("name", "Drum 3");

    expect(result).toStrictEqual([
      {
        id: "midi_track_2",
        trackIndex: 2,
      },
      {
        id: "midi_track_3",
        trackIndex: 3,
      },
      {
        id: "midi_track_4",
        trackIndex: 4,
      },
    ]);
  });

  it("should create tracks without setting properties when not provided", () => {
    const track = registerMockObject("midi_track_0", {});

    const result = createTrack({ trackIndex: 0 });

    expect(liveSet.call).toHaveBeenCalledWith("create_midi_track", 0);
    expect(track.set).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      id: "midi_track_0",
      trackIndex: 0,
    });
  });

  it("should create tracks with mute, solo, and arm states", () => {
    const track = registerMockObject("midi_track_0", {});

    const result = createTrack({
      trackIndex: 0,
      name: "Armed Track",
      mute: true,
      solo: false,
      arm: true,
    });

    expect(track.set).toHaveBeenCalledWith("name", "Armed Track");
    expect(track.set).toHaveBeenCalledWith("mute", true);
    expect(track.set).toHaveBeenCalledWith("solo", false);
    expect(track.set).toHaveBeenCalledWith("arm", true);
    expect(result).toStrictEqual({
      id: "midi_track_0",
      trackIndex: 0,
    });
  });

  it("should handle boolean false values correctly", () => {
    const track = registerMockObject("midi_track_0", {});

    const result = createTrack({
      trackIndex: 0,
      mute: false,
      solo: false,
      arm: false,
    });

    expect(track.set).toHaveBeenCalledWith("mute", false);
    expect(track.set).toHaveBeenCalledWith("solo", false);
    expect(track.set).toHaveBeenCalledWith("arm", false);
    expect(result).toStrictEqual({
      id: "midi_track_0",
      trackIndex: 0,
    });
  });

  it("should append track to end when trackIndex is omitted", () => {
    const track = registerMockObject("midi_track_-1", {});

    const result = createTrack({ name: "Appended Track" });

    expect(liveSet.call).toHaveBeenCalledWith("create_midi_track", -1);
    expect(track.set).toHaveBeenCalledWith("name", "Appended Track");
    // Result trackIndex should reflect actual position (count of existing tracks)
    expect(result).toStrictEqual({
      id: "midi_track_-1",
      trackIndex: 2, // existing tracks count
    });
  });

  it("should append track to end when trackIndex is -1", () => {
    registerMockObject("midi_track_-1", {});

    const result = createTrack({ trackIndex: -1, name: "Appended Track" });

    expect(liveSet.call).toHaveBeenCalledWith("create_midi_track", -1);
    expect((result as { trackIndex: number }).trackIndex).toBe(2); // existing tracks count
  });

  it("should throw error when count is less than 1", () => {
    expect(() => createTrack({ trackIndex: 0, count: 0 })).toThrow(
      "createTrack failed: count must be at least 1",
    );
    expect(() => createTrack({ trackIndex: 0, count: -1 })).toThrow(
      "createTrack failed: count must be at least 1",
    );
  });

  // Note: type validation is now handled by Zod schema

  it("should throw error when creating tracks would exceed maximum", () => {
    expect(() =>
      createTrack({
        trackIndex: MAX_AUTO_CREATED_TRACKS - 2,
        count: 5,
      }),
    ).toThrow(/would exceed the maximum allowed tracks/);
  });

  it("should handle single track name without incrementing", () => {
    const track = registerMockObject("midi_track_0", {});

    const result = createTrack({
      trackIndex: 0,
      count: 1,
      name: "Solo Track",
    });

    expect(track.set).toHaveBeenCalledWith("name", "Solo Track");
    expect(result).toStrictEqual({
      id: "midi_track_0",
      trackIndex: 0,
    });
  });

  it("should create tracks of mixed types", () => {
    registerMockObject("audio_track_0", {});
    registerMockObject("midi_track_1", {});

    createTrack({ trackIndex: 0, type: "audio" });
    expect(liveSet.call).toHaveBeenCalledWith("create_audio_track", 0);

    createTrack({ trackIndex: 1, type: "midi" });
    expect(liveSet.call).toHaveBeenCalledWith("create_midi_track", 1);
  });

  it("should return single object for count=1 and array for count>1", () => {
    registerMockObject("midi_track_0", {});
    registerMockObject("midi_track_1", {});
    registerMockObject("midi_track_2", {});

    const singleResult = createTrack({
      trackIndex: 0,
      count: 1,
      name: "Single",
    });
    const arrayResult = createTrack({
      trackIndex: 1,
      count: 2,
      name: "Multiple",
    });

    expect(singleResult).toStrictEqual({
      id: "midi_track_0",
      trackIndex: 0,
    });

    expect(Array.isArray(arrayResult)).toBe(true);
    const results = arrayResult as Array<{ id: string; trackIndex: number }>;

    expect(results).toHaveLength(2);
    expect(results[0]).toStrictEqual({
      id: "midi_track_1",
      trackIndex: 1,
    });
    expect(results[1]).toStrictEqual({
      id: "midi_track_2",
      trackIndex: 2,
    });
  });

  describe("return tracks", () => {
    it("should create a single return track", () => {
      const track = registerMockObject("return_track_0", {});

      const result = createTrack({ type: "return", name: "New Return" });

      expect(liveSet.call).toHaveBeenCalledWith("create_return_track");
      expect(track.set).toHaveBeenCalledWith("name", "New Return");
      // Result returnTrackIndex should reflect position (2 existing return tracks)
      expect(result).toStrictEqual({
        id: "return_track_0",
        returnTrackIndex: 2,
      });
    });

    it("should create multiple return tracks", () => {
      registerMockObject("return_track_0", {});
      registerMockObject("return_track_1", {});

      const result = createTrack({ type: "return", count: 2, name: "FX" });

      expect(liveSet.call).toHaveBeenCalledTimes(2);
      expect(liveSet.call).toHaveBeenNthCalledWith(1, "create_return_track");
      expect(liveSet.call).toHaveBeenNthCalledWith(2, "create_return_track");

      expect(result).toStrictEqual([
        { id: "return_track_0", returnTrackIndex: 2 },
        { id: "return_track_1", returnTrackIndex: 3 },
      ]);
    });

    it("should create return track with color", () => {
      const track = registerMockObject("return_track_0", {});

      createTrack({ type: "return", name: "Reverb", color: "#0000FF" });

      expect(track.set).toHaveBeenCalledWith("color", 255);
    });

    it("should warn when trackIndex provided for return track", () => {
      registerMockObject("return_track_0", {});

      createTrack({ type: "return", trackIndex: 5, name: "Ignored Index" });

      expect(console.warn).toHaveBeenCalledWith(
        "createTrack: trackIndex is ignored for return tracks (always added at end)",
      );
      // Should still create the track
      expect(liveSet.call).toHaveBeenCalledWith("create_return_track");
    });
  });

  describe("comma-separated names", () => {
    it("should use comma-separated names for each track when count matches", () => {
      const t0 = registerMockObject("midi_track_0", {});
      const t1 = registerMockObject("midi_track_1", {});
      const t2 = registerMockObject("midi_track_2", {});

      const result = createTrack({
        trackIndex: 0,
        count: 3,
        name: "kick,snare,hat",
      });

      expect(t0.set).toHaveBeenCalledWith("name", "kick");
      expect(t1.set).toHaveBeenCalledWith("name", "snare");
      expect(t2.set).toHaveBeenCalledWith("name", "hat");
      expect(result).toHaveLength(3);
    });

    it("should fall back to numbered naming when count exceeds names", () => {
      const t0 = registerMockObject("midi_track_0", {});
      const t1 = registerMockObject("midi_track_1", {});
      const t2 = registerMockObject("midi_track_2", {});
      const t3 = registerMockObject("midi_track_3", {});

      const result = createTrack({
        trackIndex: 0,
        count: 4,
        name: "kick,snare,hat",
      });

      expect(t0.set).toHaveBeenCalledWith("name", "kick");
      expect(t1.set).toHaveBeenCalledWith("name", "snare");
      expect(t2.set).toHaveBeenCalledWith("name", "hat");
      expect(t3.set).toHaveBeenCalledWith("name", "hat 2");
      expect(result).toHaveLength(4);
    });

    it("should ignore extra names when count is less than names", () => {
      const t0 = registerMockObject("midi_track_0", {});
      const t1 = registerMockObject("midi_track_1", {});

      const result = createTrack({
        trackIndex: 0,
        count: 2,
        name: "kick,snare,hat",
      });

      expect(t0.set).toHaveBeenCalledWith("name", "kick");
      expect(t1.set).toHaveBeenCalledWith("name", "snare");
      expect(result).toHaveLength(2);
    });

    it("should preserve commas in name when count is 1", () => {
      const track = registerMockObject("midi_track_0", {});

      const result = createTrack({
        trackIndex: 0,
        count: 1,
        name: "kick,snare",
      });

      expect(track.set).toHaveBeenCalledWith("name", "kick,snare");
      expect(result).toStrictEqual({
        id: "midi_track_0",
        trackIndex: 0,
      });
    });

    it("should trim whitespace around comma-separated names", () => {
      const t0 = registerMockObject("midi_track_0", {});
      const t1 = registerMockObject("midi_track_1", {});
      const t2 = registerMockObject("midi_track_2", {});

      createTrack({
        trackIndex: 0,
        count: 3,
        name: " kick , snare , hat ",
      });

      expect(t0.set).toHaveBeenCalledWith("name", "kick");
      expect(t1.set).toHaveBeenCalledWith("name", "snare");
      expect(t2.set).toHaveBeenCalledWith("name", "hat");
    });

    it("should continue numbering from 2 when falling back", () => {
      const t0 = registerMockObject("midi_track_0", {});
      const t1 = registerMockObject("midi_track_1", {});
      const t2 = registerMockObject("midi_track_2", {});
      const t3 = registerMockObject("midi_track_3", {});
      const t4 = registerMockObject("midi_track_4", {});

      createTrack({
        trackIndex: 0,
        count: 5,
        name: "kick,snare,hat",
      });

      // First 3 tracks use the provided names
      expect(t0.set).toHaveBeenCalledWith("name", "kick");
      expect(t1.set).toHaveBeenCalledWith("name", "snare");
      expect(t2.set).toHaveBeenCalledWith("name", "hat");
      // Subsequent tracks use "hat 2", "hat 3" (starting from 2)
      expect(t3.set).toHaveBeenCalledWith("name", "hat 2");
      expect(t4.set).toHaveBeenCalledWith("name", "hat 3");
    });
  });

  describe("comma-separated colors", () => {
    it("should cycle through colors with modular arithmetic", () => {
      const t0 = registerMockObject("midi_track_0", {});
      const t1 = registerMockObject("midi_track_1", {});
      const t2 = registerMockObject("midi_track_2", {});
      const t3 = registerMockObject("midi_track_3", {});

      createTrack({
        trackIndex: 0,
        count: 4,
        name: "Track",
        color: "#FF0000,#00FF00",
      });

      // Colors cycle: red, green, red, green
      expect(t0.set).toHaveBeenCalledWith("color", 16711680); // #FF0000
      expect(t1.set).toHaveBeenCalledWith("color", 65280); // #00FF00
      expect(t2.set).toHaveBeenCalledWith("color", 16711680); // #FF0000
      expect(t3.set).toHaveBeenCalledWith("color", 65280); // #00FF00
    });

    it("should use colors in order when count matches", () => {
      const t0 = registerMockObject("midi_track_0", {});
      const t1 = registerMockObject("midi_track_1", {});
      const t2 = registerMockObject("midi_track_2", {});

      createTrack({
        trackIndex: 0,
        count: 3,
        name: "Track",
        color: "#FF0000,#00FF00,#0000FF",
      });

      expect(t0.set).toHaveBeenCalledWith("color", 16711680); // #FF0000
      expect(t1.set).toHaveBeenCalledWith("color", 65280); // #00FF00
      expect(t2.set).toHaveBeenCalledWith("color", 255); // #0000FF
    });

    it("should ignore extra colors when count is less than colors", () => {
      const t0 = registerMockObject("midi_track_0", {});
      const t1 = registerMockObject("midi_track_1", {});

      createTrack({
        trackIndex: 0,
        count: 2,
        name: "Track",
        color: "#FF0000,#00FF00,#0000FF",
      });

      expect(t0.set).toHaveBeenCalledWith("color", 16711680); // #FF0000
      expect(t1.set).toHaveBeenCalledWith("color", 65280); // #00FF00
      // #0000FF is not used
    });

    it("should throw error when count is 1 and color contains commas", () => {
      // When count=1, commas are not parsed, so the invalid color format throws
      expect(() =>
        createTrack({
          trackIndex: 0,
          count: 1,
          name: "Track",
          color: "#FF0000,#00FF00",
        }),
      ).toThrow('Invalid color format: must be "#RRGGBB"');
    });

    it("should trim whitespace around comma-separated colors", () => {
      const t0 = registerMockObject("midi_track_0", {});
      const t1 = registerMockObject("midi_track_1", {});

      createTrack({
        trackIndex: 0,
        count: 2,
        name: "Track",
        color: " #FF0000 , #00FF00 ",
      });

      expect(t0.set).toHaveBeenCalledWith("color", 16711680); // #FF0000
      expect(t1.set).toHaveBeenCalledWith("color", 65280); // #00FF00
    });
  });
});

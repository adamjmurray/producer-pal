// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateBeatPositions } from "../helpers/update-clip-timing-helpers.ts";

describe("update-clip-timing-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * A clip stub answering only the properties calculateBeatPositions reads;
   * anything else reads 0, matching the Live API's numeric default.
   * @param props - The property values this case pins
   * @returns A clip stub for the `clip` argument
   */
  const clipStub = (props: Record<string, number>): LiveAPI =>
    ({
      getProperty: vi.fn((prop: string) => props[prop] ?? 0),
    }) as unknown as LiveAPI;

  describe("calculateBeatPositions", () => {
    it("should warn when firstStart exceeds end_marker", () => {
      const mockClip = clipStub({
        end_marker: 4, // 1 bar at 4/4
      });

      const result = calculateBeatPositions({
        firstStart: "3|1", // 8 beats > end_marker (4)
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        clip: mockClip,
        isLooping: true,
        beatsPerMarkerUnit: 1,
        markerClampSeconds: 0,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("firstStart parameter ignored"),
      );
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("exceeds clip content boundary"),
      );
      expect(result.startMarkerBeats).toBeNull();
      expect(result.firstStartBeats).toBe(8); // Still calculated, just not applied
    });

    it("should set startMarkerBeats when firstStart is within end_marker", () => {
      vi.mocked(outlet).mockClear();

      const mockClip = clipStub({
        end_marker: 8, // 2 bars at 4/4
      });

      const result = calculateBeatPositions({
        firstStart: "1|3", // 2 beats < end_marker (8)
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        clip: mockClip,
        isLooping: true,
        beatsPerMarkerUnit: 1,
        markerClampSeconds: 0,
      });

      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
      expect(result.startMarkerBeats).toBe(2);
      expect(result.firstStartBeats).toBe(2);
    });

    it("rejects a 0-indexed start with the 1-indexing steer (parity with create-clip)", () => {
      const mockClip = clipStub({});

      expect(() =>
        calculateBeatPositions({
          start: "1|0",
          timeSigNumerator: 4,
          timeSigDenominator: 4,
          clip: mockClip,
          isLooping: true,
          beatsPerMarkerUnit: 1,
          markerClampSeconds: 0,
        }),
      ).toThrow(/beats are 1-indexed/);
    });

    it("rejects a 0-indexed firstStart with the 1-indexing steer", () => {
      const mockClip = clipStub({});

      expect(() =>
        calculateBeatPositions({
          firstStart: "0|1",
          timeSigNumerator: 4,
          timeSigDenominator: 4,
          clip: mockClip,
          isLooping: true,
          beatsPerMarkerUnit: 1,
          markerClampSeconds: 0,
        }),
      ).toThrow(/bars are 1-indexed/);
    });

    it("should not warn when start exceeds end_marker (silent skip intentional)", () => {
      vi.mocked(outlet).mockClear();

      const mockClip = clipStub({
        end_marker: 4, // 1 bar at 4/4
      });

      const result = calculateBeatPositions({
        start: "3|1", // 8 beats > end_marker (4), but no warning for start param
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        clip: mockClip,
        isLooping: true,
        beatsPerMarkerUnit: 1,
        markerClampSeconds: 0,
      });

      // No warning for start param - silent skip is intentional
      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
      expect(result.startMarkerBeats).toBeNull();
      expect(result.startBeats).toBe(8);
    });

    it("treats firstStart AT the end_marker as out of bounds (strict <, not <=)", () => {
      // firstStartBeats === end_marker: the strict `<` rejects it, warns, and
      // leaves start_marker unset. `<=` would wrongly accept it and return the
      // value with no warning.
      const mockClip = clipStub({ end_marker: 4 });

      const result = calculateBeatPositions({
        firstStart: "2|1", // exactly 4 beats == end_marker (4)
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        clip: mockClip,
        isLooping: true,
        beatsPerMarkerUnit: 1,
        markerClampSeconds: 0,
      });

      expect(result.firstStartBeats).toBe(4);
      expect(result.startMarkerBeats).toBeNull();
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("firstStart parameter ignored"),
      );
    });

    it("treats start AT the end_marker as out of bounds (strict <, not <=)", () => {
      // startBeats === end_marker (no firstStart): strict `<` rejects it, so
      // start_marker stays null. Both `<=` and forcing the whole guard true
      // would return the start value instead.
      const mockClip = clipStub({ end_marker: 4 });

      const result = calculateBeatPositions({
        start: "2|1", // exactly 4 beats == end_marker (4)
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        clip: mockClip,
        isLooping: false,
        beatsPerMarkerUnit: 1,
        markerClampSeconds: 0,
      });

      expect(result.startBeats).toBe(4);
      expect(result.startMarkerBeats).toBeNull();
      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
    });

    it("derives start from end_marker - length on non-looping clips (no drift warn)", () => {
      // start omitted + length given on a non-looping MIDI clip: startBeats =
      // end_marker - lengthBeats = 8 - 4 = 4 (a `+` gives 12). With start_marker
      // matching the derived start, abs diff is 0 so there is no drift warning
      // (a `+` inside abs(), or forcing the guard true, would warn).
      const mockClip = clipStub({
        end_marker: 8,
        start_marker: 4,
        is_midi_clip: 1,
      });

      const result = calculateBeatPositions({
        length: "1bar", // 4 beats at 4/4
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        clip: mockClip,
        isLooping: false,
        beatsPerMarkerUnit: 1,
        markerClampSeconds: 0,
      });

      expect(result.startBeats).toBe(4);
      expect(result.endBeats).toBe(8);
      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
    });

    it("does not warn when derived-start drift is exactly SAME_TIME_EPSILON (strict >)", () => {
      // Derived start = 4 - 4 = 0; start_marker = -0.001 → abs diff == 0.001 ==
      // SAME_TIME_EPSILON exactly. The strict `>` does NOT warn at the boundary;
      // `>=` would.
      const mockClip = clipStub({
        end_marker: 4,
        start_marker: -0.001,
        is_midi_clip: 1,
      });

      const result = calculateBeatPositions({
        length: "1bar", // 4 beats → derived start = 4 - 4 = 0
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        clip: mockClip,
        isLooping: false,
        beatsPerMarkerUnit: 1,
        markerClampSeconds: 0,
      });

      expect(result.startBeats).toBe(0);
      expect(outlet).not.toHaveBeenCalledWith(1, expect.anything());
    });
  });
});

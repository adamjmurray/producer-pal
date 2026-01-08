import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { transformClips } from "#src/tools/operations/transform-clips/transform-clips.js";
import {
  setupUnloopedClipSlicingMocks,
  setupSlicingClipBaseMocks,
} from "./transform-clips-slicing-test-helpers.js";

describe("transformClips - slicing unlooped clips", () => {
  it("should slice unlooped MIDI clips via duplication", () => {
    const clipId = "clip_1";
    const { callState } = setupUnloopedClipSlicingMocks(clipId);
    const setCalls = [];

    liveApiSet.mockImplementation(function (prop, value) {
      setCalls.push({ id: this._id, prop, value });
    });

    transformClips(
      {
        clipIds: clipId,
        slice: "1:0.0", // 1 bar = 4 beats slice
        seed: 12345,
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should have 3 duplicate calls: holding, move back, and reveal second slice
    expect(callState.duplicateCalls).toHaveLength(3);

    // Third duplicate should be at position 4 (second slice)
    expect(callState.duplicateCalls[2].args[1]).toBe(4);

    // Should use looping workaround: set looping=1, then set markers, then looping=0
    const loopingEnableCalls = setCalls.filter(
      (c) => c.prop === "looping" && c.value === 1,
    );
    const loopingDisableCalls = setCalls.filter(
      (c) => c.prop === "looping" && c.value === 0,
    );

    expect(loopingEnableCalls.length).toBeGreaterThanOrEqual(1);
    expect(loopingDisableCalls.length).toBeGreaterThanOrEqual(1);

    // Should set start_marker and end_marker for the revealed slice
    const startMarkerCalls = setCalls.filter((c) => c.prop === "start_marker");
    const endMarkerCalls = setCalls.filter((c) => c.prop === "end_marker");

    expect(startMarkerCalls.length).toBeGreaterThanOrEqual(1);
    expect(endMarkerCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("should slice unlooped warped audio clips and reveal hidden content", () => {
    const clipId = "clip_1";
    let callCount = 0;
    const duplicateCalls = [];
    const setCalls = [];

    setupSlicingClipBaseMocks(clipId, {
      generatedPrefixes: ["holding_", "moved_", "slice_"],
    });

    // Setup liveApiGet with warping support for audio clips
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
      }

      if (this._id === clipId) {
        const props = {
          is_midi_clip: 0,
          is_audio_clip: 1,
          is_arrangement_clip: 1,
          looping: 0,
          warping: 1,
          start_time: 0.0,
          end_time: 16.0,
          start_marker: 0.0,
        };

        if (prop in props) return [props[prop]];
      }

      if (this._id?.startsWith("holding_") && prop === "end_time")
        return [40000 + 4];
      if (
        (this._id?.startsWith("moved_") || this._id?.startsWith("slice_")) &&
        (prop === "start_marker" || prop === "warping")
      )
        return prop === "warping" ? [1] : [0.0];
      if (this._path === "live_set tracks 0" && prop === "track_index")
        return [0];

      return [0];
    });

    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;
        duplicateCalls.push({ position: args[1] });
        if (callCount === 1) return ["id", "holding_1"];
        if (callCount === 2) return ["id", "moved_1"];

        return ["id", `slice_${callCount}`];
      }

      if (method === "create_midi_clip") return ["id", "temp_1"];

      return undefined;
    });

    liveApiSet.mockImplementation(function (prop, value) {
      setCalls.push({ id: this._id, prop, value });
    });

    transformClips(
      {
        clipIds: clipId,
        slice: "1:0.0", // 1 bar = 4 beats slice
        seed: 12345,
      },
      { holdingAreaStartBeats: 40000 },
    );

    // Should have 5 duplicate calls: holding, move back, and 3 reveal slices (at 4, 8, 12)
    expect(duplicateCalls).toHaveLength(5);

    // Slices should be at positions 4, 8, 12
    expect(duplicateCalls[2].position).toBe(4);
    expect(duplicateCalls[3].position).toBe(8);
    expect(duplicateCalls[4].position).toBe(12);

    // Should use looping workaround: set looping=1, then set markers, then looping=0
    const loopingEnableCalls = setCalls.filter(
      (c) => c.prop === "looping" && c.value === 1,
    );
    const loopingDisableCalls = setCalls.filter(
      (c) => c.prop === "looping" && c.value === 0,
    );

    expect(loopingEnableCalls.length).toBeGreaterThanOrEqual(3);
    expect(loopingDisableCalls.length).toBeGreaterThanOrEqual(3);

    // Should set start_marker and end_marker for the revealed slices
    const startMarkerCalls = setCalls.filter((c) => c.prop === "start_marker");
    const endMarkerCalls = setCalls.filter((c) => c.prop === "end_marker");

    expect(startMarkerCalls.length).toBeGreaterThanOrEqual(3);
    expect(endMarkerCalls.length).toBeGreaterThanOrEqual(3);
  });

  it("should not place shortener clips beyond original clip boundary (unwarped audio)", () => {
    // This tests the bug fix where slicing an unwarped audio clip would place a
    // "shortener" clip at the boundary, damaging adjacent clips.
    // The fix: only use shortener when revealed clip is longer than expected.
    const clipId = "clip_45";
    const sessionSlotId = "session_slot_1";
    const sessionClipId = "session_clip_1";
    let duplicateCallCount = 0;
    const duplicateCalls = [];

    liveApiId.mockImplementation(function () {
      return this._path === "id clip_45" ? clipId : this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) return "live_set tracks 0 arrangement_clips 0";
      if (this._id?.startsWith("holding_")) return "live_set tracks 0 arr 1";
      if (this._id?.startsWith("moved_")) return "live_set tracks 0 arr 1";
      if (this._id?.startsWith("revealed_")) return "live_set tracks 0 arr 2";
      if (this._id === sessionSlotId) return "live_set tracks 0 clip_slots 0";

      return this._path;
    });
    liveApiType.mockImplementation(function () {
      return this._id === clipId ? "Clip" : undefined;
    });

    mockLiveApiGet({
      [clipId]: {
        is_midi_clip: 0,
        is_audio_clip: 1,
        is_arrangement_clip: 1,
        looping: 0,
        warping: 0, // Unwarped!
        start_time: 0.0,
        end_time: 4.0, // 1 bar
        start_marker: 0.0,
        file_path: "/path/to/audio.wav",
      },
      holding_1: { end_time: 40001 },
      moved_1: {
        start_marker: 0.0,
        warping: 0,
        file_path: "/path/to/audio.wav",
      },
      // Revealed clips end at exact expected position (no shortener needed)
      revealed_1: { start_time: 1, end_time: 2, warping: 0 },
      revealed_2: { start_time: 2, end_time: 3, warping: 0 },
      revealed_3: { start_time: 3, end_time: 4, warping: 0 },
      [sessionSlotId]: { has_clip: 1 },
      [sessionClipId]: { is_midi_clip: 0 },
      "live_set tracks 0": { track_index: 0, clip_slots: [sessionSlotId] },
    });

    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "duplicate_clip_to_arrangement") {
        duplicateCallCount++;
        const position = args[1];

        duplicateCalls.push({ id: this._id, position });
        if (duplicateCallCount === 1) return ["id", "holding_1"];
        if (duplicateCallCount === 2) return ["id", "moved_1"];

        return ["id", `revealed_${position}`];
      }

      if (method === "create_audio_clip") return ["id", sessionClipId];

      return undefined;
    });

    transformClips(
      { clipIds: clipId, slice: "0:1", seed: 12345 },
      { holdingAreaStartBeats: 40000, silenceWavPath: "/path/to/silence.wav" },
    );

    // Key: No clips should be placed at position 4 (where adjacent clip would be)
    const callsAtBoundary = duplicateCalls.filter((c) => c.position === 4);

    expect(callsAtBoundary).toHaveLength(0);

    // Should have slices at positions 1, 2, 3 (not 4)
    const slicePositions = duplicateCalls.map((c) => c.position);

    expect(slicePositions).toContain(1);
    expect(slicePositions).toContain(2);
    expect(slicePositions).toContain(3);
  });
});

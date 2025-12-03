import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiSet,
  liveApiType,
} from "../../../../test/mock-live-api.js";
import { transformClips } from "../transform-clips.js";

describe("transformClips - slicing unlooped clips", () => {
  it("should slice unlooped MIDI clips and reveal hidden content via duplication", () => {
    const clipId = "clip_1";
    let callCount = 0;
    const duplicateCalls = [];
    const setCalls = [];

    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return clipId;
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
        return "live_set tracks 0 arrangement_clips 0";
      }
      if (
        this._id?.startsWith("holding_") ||
        this._id?.startsWith("moved_") ||
        this._id?.startsWith("slice_")
      ) {
        return "live_set tracks 0 arrangement_clips 1";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === clipId) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }
        if (prop === "signature_denominator") {
          return [4];
        }
      }
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "looping") {
          return [0]; // Not looped
        }
        if (prop === "start_time") {
          return [0.0];
        }
        if (prop === "end_time") {
          return [8.0]; // 2 bars (8 beats) long
        }
      }
      if (this._id?.startsWith("holding_")) {
        if (prop === "end_time") {
          return [40000 + 8]; // Needs temp clip to shorten
        }
      }
      if (this._id?.startsWith("moved_") || this._id?.startsWith("slice_")) {
        if (prop === "start_marker") {
          return [0.0]; // Content starts at 0
        }
      }
      if (this._path === "live_set tracks 0") {
        if (prop === "track_index") {
          return [0];
        }
      }
      return [0];
    });

    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;
        duplicateCalls.push({ position: args[1] });
        if (callCount === 1) {
          return ["id", "holding_1"];
        }
        if (callCount === 2) {
          return ["id", "moved_1"];
        }
        return ["id", `slice_${callCount}`];
      }
      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
      if (method === "get_notes_extended") {
        // Return notes that span the full 8 beats (content at beats 0, 2, 4, 6)
        return JSON.stringify({
          notes: [
            { pitch: 60, start_time: 0, duration: 0.5 },
            { pitch: 62, start_time: 2, duration: 0.5 },
            { pitch: 64, start_time: 4, duration: 0.5 },
            { pitch: 65, start_time: 6, duration: 0.5 },
          ],
        });
      }
      return undefined;
    });

    liveApiSet.mockImplementation(function (prop, value) {
      setCalls.push({ id: this._id, prop, value });
    });

    transformClips({
      clipIds: clipId,
      slice: "1:0.0", // 1 bar = 4 beats slice
      seed: 12345,
    });

    // Should have 3 duplicate calls: holding, move back, and reveal second slice
    expect(duplicateCalls.length).toBe(3);

    // Third duplicate should be at position 4 (second slice)
    expect(duplicateCalls[2].position).toBe(4);

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

  it("should create empty clip when slicing beyond actual content", () => {
    const clipId = "clip_1";
    let callCount = 0;
    const createMidiClipCalls = [];

    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return clipId;
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
        return "live_set tracks 0 arrangement_clips 0";
      }
      if (this._id?.startsWith("holding_") || this._id?.startsWith("moved_")) {
        return "live_set tracks 0 arrangement_clips 1";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === clipId) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }
        if (prop === "signature_denominator") {
          return [4];
        }
      }
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [1];
        }
        if (prop === "is_audio_clip") {
          return [0];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "looping") {
          return [0]; // Not looped
        }
        if (prop === "start_time") {
          return [0.0];
        }
        if (prop === "end_time") {
          return [8.0]; // 2 bars (8 beats) arrangement length
        }
      }
      if (this._id?.startsWith("holding_")) {
        if (prop === "end_time") {
          return [40000 + 8];
        }
      }
      if (this._id?.startsWith("moved_")) {
        if (prop === "start_marker") {
          return [0.0];
        }
      }
      if (this._path === "live_set tracks 0") {
        if (prop === "track_index") {
          return [0];
        }
      }
      return [0];
    });

    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;
        if (callCount === 1) {
          return ["id", "holding_1"];
        }
        return ["id", "moved_1"];
      }
      if (method === "create_midi_clip") {
        createMidiClipCalls.push(args);
        return ["id", "empty_1"];
      }
      if (method === "get_notes_extended") {
        // Notes only in first 2 beats - content ends before second slice
        return JSON.stringify({
          notes: [
            { pitch: 60, start_time: 0, duration: 0.5 },
            { pitch: 62, start_time: 1, duration: 0.5 },
          ],
        });
      }
      return undefined;
    });

    transformClips({
      clipIds: clipId,
      slice: "1:0.0", // 1 bar = 4 beats slice
      seed: 12345,
    });

    // Should create empty MIDI clip for second slice (beyond content at beat 2)
    const emptyClipCall = createMidiClipCalls.find(
      (args) => args[0] === 4 && args[1] === 4,
    );
    expect(emptyClipCall).toBeDefined();
  });

  it("should slice unlooped warped audio clips and reveal hidden content", () => {
    const clipId = "clip_1";
    let callCount = 0;
    const duplicateCalls = [];
    const setCalls = [];

    liveApiId.mockImplementation(function () {
      if (this._path === "id clip_1") {
        return clipId;
      }
      return this._id;
    });
    liveApiPath.mockImplementation(function () {
      if (this._id === clipId) {
        return "live_set tracks 0 arrangement_clips 0";
      }
      if (
        this._id?.startsWith("holding_") ||
        this._id?.startsWith("moved_") ||
        this._id?.startsWith("slice_")
      ) {
        return "live_set tracks 0 arrangement_clips 1";
      }
      return this._path;
    });
    liveApiType.mockImplementation(function () {
      if (this._id === clipId) {
        return "Clip";
      }
    });
    liveApiGet.mockImplementation(function (prop) {
      if (this._path === "live_set") {
        if (prop === "signature_numerator") {
          return [4];
        }
        if (prop === "signature_denominator") {
          return [4];
        }
      }
      if (this._id === clipId) {
        if (prop === "is_midi_clip") {
          return [0]; // Audio clip
        }
        if (prop === "is_audio_clip") {
          return [1];
        }
        if (prop === "is_arrangement_clip") {
          return [1];
        }
        if (prop === "looping") {
          return [0]; // Not looped
        }
        if (prop === "warping") {
          return [1]; // Warped
        }
        if (prop === "start_time") {
          return [0.0];
        }
        if (prop === "end_time") {
          return [16.0]; // 4 bars long
        }
        if (prop === "start_marker") {
          return [0.0];
        }
      }
      if (this._id?.startsWith("holding_")) {
        if (prop === "end_time") {
          return [40000 + 4]; // Holding area + slice length (no temp clip needed)
        }
      }
      if (this._id?.startsWith("moved_") || this._id?.startsWith("slice_")) {
        if (prop === "start_marker") {
          return [0.0];
        }
        if (prop === "warping") {
          return [1];
        }
      }
      if (this._path === "live_set tracks 0") {
        if (prop === "track_index") {
          return [0];
        }
      }
      return [0];
    });

    liveApiCall.mockImplementation(function (method, ...args) {
      if (method === "duplicate_clip_to_arrangement") {
        callCount++;
        duplicateCalls.push({ position: args[1] });
        if (callCount === 1) {
          return ["id", "holding_1"];
        }
        if (callCount === 2) {
          return ["id", "moved_1"];
        }
        return ["id", `slice_${callCount}`];
      }
      if (method === "create_midi_clip") {
        return ["id", "temp_1"];
      }
      return undefined;
    });

    liveApiSet.mockImplementation(function (prop, value) {
      setCalls.push({ id: this._id, prop, value });
    });

    transformClips({
      clipIds: clipId,
      slice: "1:0.0", // 1 bar = 4 beats slice
      seed: 12345,
    });

    // Should have 5 duplicate calls: holding, move back, and 3 reveal slices (at 4, 8, 12)
    expect(duplicateCalls.length).toBe(5);

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
});

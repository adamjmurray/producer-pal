import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { createClip } from "./create-clip.js";

describe("createClip - advanced features", () => {
  it("should set time signature when provided", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      timeSignature: "6/8",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "signature_numerator",
      6,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "signature_denominator",
      8,
    );
    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      trackIndex: 0,
      sceneIndex: 0,
    });
  });

  it("should calculate correct clip length based on note start position", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "t2 C3 1|1 t3 D3 1|3", // Last note starts at beat 2 (0-based), rounds up to 1 bar = 4 beats
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      4,
    );
  });

  it("should return single object for single position and array for multiple positions", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    const singleResult = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      name: "Single",
    });

    const arrayResult = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "1,2",
      name: "Multiple",
    });

    expect(singleResult).toMatchObject({
      id: expect.any(String),
      trackIndex: 0,
      sceneIndex: 0,
    });
    expect(singleResult.length).toBeUndefined();

    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
    expect(arrayResult[0]).toStrictEqual({
      id: expect.any(String),
      trackIndex: 0,
      sceneIndex: 1,
    });
    expect(arrayResult[1]).toStrictEqual({
      id: expect.any(String),
      trackIndex: 0,
      sceneIndex: 2,
    });
  });

  it("should filter out v0 notes when creating clips", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    const result = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "v100 C3 v0 D3 v80 E3 1|1", // D3 should be filtered out
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 64,
            start_time: 0,
            duration: 1,
            velocity: 80,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ],
      },
    );

    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      trackIndex: 0,
      sceneIndex: 0,
      noteCount: 2,
      length: "1:0",
    }); // C3 and E3, D3 filtered out
  });

  it("should handle clips with all v0 notes filtered out", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      notes: "v0 C3 D3 E3 1|1", // All notes should be filtered out
    });

    expect(liveApiCall).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
  });

  it("should set start and firstStart when provided", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: "0",
      name: "Test Clip",
      notes: "C3 D3",
      start: "1|3",
      firstStart: "1|2",
    });

    // start "1|3" converts to 2 beats (bar 1, beat 3)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "start_marker",
      2,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "loop_start",
      2,
    );
  });

  describe("switchView functionality", () => {
    it("should switch to session view when creating session clips with switchView=true", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      const result = createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(result).toStrictEqual({
        id: "live_set/tracks/0/clip_slots/0/clip",
        trackIndex: 0,
        sceneIndex: 0,
      });
    });

    it("should switch to arrangement view when creating arrangement clips with switchView=true", () => {
      mockLiveApiGet({
        Track: { exists: () => true },
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      liveApiCall.mockImplementation((method) => {
        if (method === "create_midi_clip") {
          return ["id", "arrangement_clip"];
        }

        return null;
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "id arrangement_clip") {
          return "arrangement_clip";
        }

        return this._id;
      });

      const result = createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStart: "1|1",
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
      expect(result).toStrictEqual({
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStart: "1|1",
      });
    });

    it("should not switch views when switchView=false", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0",
        switchView: false,
      });

      expect(liveApiCall).not.toHaveBeenCalledWith(
        "show_view",
        expect.anything(),
      );
    });

    it("should work with multiple clips when switchView=true", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      const result = createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: "0,1",
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });
});

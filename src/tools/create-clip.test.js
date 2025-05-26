// src/tools/create-clip.test.js
import { describe, expect, it, vi } from "vitest";
import { children, liveApiCall, liveApiId, liveApiSet, mockLiveApiGet, MockSequence } from "../mock-live-api";
import * as notation from "../notation/notation";
import { MAX_AUTO_CREATED_SCENES } from "./constants";
import { createClip } from "./create-clip";

let parseNotationSpy;

describe("createClip", () => {
  beforeEach(() => {
    parseNotationSpy = vi.spyOn(notation, "parseNotation");
    // Default mock implementation
    parseNotationSpy.mockReturnValue([
      { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 62, start_time: 0, duration: 1, velocity: 100 },
      { pitch: 64, start_time: 0, duration: 1, velocity: 100 },
    ]);
  });

  afterEach(() => {
    parseNotationSpy.mockClear();
  });

  it("should throw error when required parameters are missing", () => {
    expect(() => createClip({})).toThrow("createClip failed: view parameter is required");
    expect(() => createClip({ view: "Session" })).toThrow("createClip failed: trackIndex is required");
    expect(() => createClip({ view: "Session", trackIndex: 0 })).toThrow(
      "createClip failed: clipSlotIndex is required when view is 'Session'"
    );
    expect(() => createClip({ view: "Arranger", trackIndex: 0 })).toThrow(
      "createClip failed: arrangerStartTime is required when view is 'Arranger'"
    );
  });

  it("should throw error when count is less than 1", () => {
    expect(() => createClip({ view: "Session", trackIndex: 0, clipSlotIndex: 0, count: 0 })).toThrow(
      "createClip failed: count must be at least 1"
    );
  });

  it("should validate time signature early when provided", () => {
    expect(() =>
      createClip({
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 0,
        timeSignature: "invalid",
      })
    ).toThrow("Time signature must be in format");
  });

  it("should read time signature from song when not provided", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    const result = createClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "1:1 C3 2:1 D3", // Should parse with 3 beats per bar from song
    });

    expect(result).toEqual({
      clipSlotIndex: 0,
      id: "live_set/tracks/0/clip_slots/0/clip",
      notes: "1:1 C3 2:1 D3",
      timeSignature: "6/8",
      trackIndex: 0,
      type: "midi",
      view: "Session",
    });

    expect(parseNotationSpy).toHaveBeenCalledWith("1:1 C3 2:1 D3", { beatsPerBar: 6 });
  });

  it("should parse notes using provided time signature", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
    });

    createClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      timeSignature: "6/8",
      notes: "1:1 C3 2:1 D3", // Should parse with 6 beats per bar
    });

    expect(parseNotationSpy).toHaveBeenCalledWith("1:1 C3 2:1 D3", { beatsPerBar: 6 });
  });

  it("should create clip with length based on endMarker for non-looping clips", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      endMarker: 6,
      loop: false,
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_clip", 6);
  });

  it("should create clip with length based on loopEnd for looping clips", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      loopEnd: 8,
      loop: true,
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_clip", 8);
  });

  it("should calculate clip length from notes when markers not provided", () => {
    // Restore real parseNotation for this test
    parseNotationSpy.mockRestore();

    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "1:1 t2 C3 1:4 t1.5 D3", // Notes ends at bar.beat 5.5, which is beat 0-indexed position 4.5,which should round up to 5
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_clip", 5);
  });

  it("should create minimum 1-beat clip when empty", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_clip", 1);
  });

  it("should use minimum clip length of 1 when notes are empty", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    parseNotationSpy.mockReturnValue([]);

    createClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "",
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_clip", 1);
  });

  describe("Session view", () => {
    it("should create a single clip with notes", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0 clip_slots 0 clip":
            return "clip_0_0";
          default:
            return this._path.replace(/\s+/g, "/");
        }
      });
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        LiveSet: { signature_numerator: 4 },
        Clip: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });

      const result = createClip({
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 0,
        notes: "1:1 C3 D3 E3",
        name: "New Clip",
        color: "#FF0000",
        loop: true,
        autoplay: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("create_clip", 1); // Length based on notes
      expect(liveApiSet).toHaveBeenCalledWith("name", "New Clip");
      expect(liveApiSet).toHaveBeenCalledWith("color", 16711680);
      expect(liveApiSet).toHaveBeenCalledWith("looping", true);
      expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
        notes: expect.arrayContaining([
          expect.objectContaining({ pitch: 60, start_time: 0, duration: 1, velocity: 100 }),
          expect.objectContaining({ pitch: 62, start_time: 0, duration: 1, velocity: 100 }),
          expect.objectContaining({ pitch: 64, start_time: 0, duration: 1, velocity: 100 }),
        ]),
      });
      expect(liveApiCall).toHaveBeenCalledWith("fire");
      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id clip_0_0");

      expect(result).toEqual({
        id: "clip_0_0",
        type: "midi",
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 0,
        name: "New Clip",
        color: "#FF0000",
        loop: true,
        notes: "1:1 C3 D3 E3",
        timeSignature: "4/4",
        isTriggered: true,
      });
    });

    it("should create multiple clips in successive slots", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0 clip_slots 1 clip":
            return "clip_0_1";
          case "live_set tracks 0 clip_slots 2 clip":
            return "clip_0_2";
          case "live_set tracks 0 clip_slots 3 clip":
            return "clip_0_3";
          default:
            return this._path.replace(/\s+/g, "/");
        }
      });
      mockLiveApiGet({
        LiveSet: {
          scenes: children("scene0"), // Only 1 existing scene, so we need to create scenes 1, 2, 3
          signature_numerator: 4,
        },
        ClipSlot: { has_clip: 0 },
      });

      const result = createClip({
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 1,
        count: 3,
        name: "Loop",
        color: "#00FF00",
      });

      // Should create 3 scenes first (for slots 1, 2, 3), then 3 clips
      expect(liveApiCall).toHaveBeenCalledWith("create_scene", -1); // scene for slot 1
      expect(liveApiCall).toHaveBeenCalledWith("create_scene", -1); // scene for slot 2
      expect(liveApiCall).toHaveBeenCalledWith("create_scene", -1); // scene for slot 3
      expect(liveApiCall).toHaveBeenCalledWith("create_clip", 1); // clip in slot 1
      expect(liveApiCall).toHaveBeenCalledWith("create_clip", 1); // clip in slot 2
      expect(liveApiCall).toHaveBeenCalledWith("create_clip", 1); // clip in slot 3

      expect(liveApiSet).toHaveBeenCalledWith("name", "Loop");
      expect(liveApiSet).toHaveBeenCalledWith("name", "Loop 2");
      expect(liveApiSet).toHaveBeenCalledWith("name", "Loop 3");

      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id clip_0_1");

      expect(result).toEqual([
        {
          id: "clip_0_1",
          type: "midi",
          view: "Session",
          trackIndex: 0,
          clipSlotIndex: 1,
          name: "Loop",
          color: "#00FF00",
          timeSignature: "4/4",
        },
        {
          id: "clip_0_2",
          type: "midi",
          view: "Session",
          trackIndex: 0,
          clipSlotIndex: 2,
          name: "Loop 2",
          color: "#00FF00",
          timeSignature: "4/4",
        },
        {
          id: "clip_0_3",
          type: "midi",
          view: "Session",
          trackIndex: 0,
          clipSlotIndex: 3,
          name: "Loop 3",
          color: "#00FF00",
          timeSignature: "4/4",
        },
      ]);
    });

    it("should auto-create scenes when clipSlotIndex exceeds existing scenes", () => {
      mockLiveApiGet({
        LiveSet: {
          scenes: children("scene1", "scene2"), // 2 existing scenes
          signature_numerator: 4,
        },
        ClipSlot: { has_clip: new MockSequence(0, 1) },
      });

      createClip({
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 4, // Needs scenes at indices 2, 3, 4
        name: "Future Clip",
      });

      // Should create 3 padding scenes (indices 2,3,4)
      expect(liveApiCall).toHaveBeenCalledWith("create_scene", -1); // padding scene 1
      expect(liveApiCall).toHaveBeenCalledWith("create_scene", -1); // padding scene 2
      expect(liveApiCall).toHaveBeenCalledWith("create_scene", -1); // padding scene 3

      expect(liveApiCall).toHaveBeenCalledWith("create_clip", 1);
    });

    it("should throw error if clip already exists in session view clip slot", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 1 },
        LiveSet: { signature_numerator: 4 },
      });
      expect(() =>
        createClip({
          view: "Session",
          trackIndex: 0,
          clipSlotIndex: 0,
          name: "This Should Fail",
        })
      ).toThrow("createClip failed: a clip already exists at track 0, clip slot 0");
    });

    it("should throw error if clipSlotIndex exceeds maximum allowed scenes", () => {
      expect(() =>
        createClip({
          view: "Session",
          trackIndex: 0,
          clipSlotIndex: MAX_AUTO_CREATED_SCENES,
          name: "This Should Fail",
        })
      ).toThrow(/exceeds the maximum allowed value/);
    });
  });

  describe("Arranger view", () => {
    it("should create a single clip in arranger", () => {
      mockLiveApiGet({
        Track: { exists: () => true },
        LiveSet: { signature_numerator: 4 },
        Clip: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });

      liveApiCall.mockImplementation((method, ...args) => {
        if (method === "create_midi_clip") {
          return ["id", "arranger_clip"];
        }
        return null;
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "id arranger_clip") return "arranger_clip";
        return "1";
      });

      const result = createClip({
        view: "Arranger",
        trackIndex: 0,
        arrangerStartTime: 8,
        notes: "1:1 C3 D3 E3",
        name: "Arranger Clip",
      });

      expect(liveApiCall).toHaveBeenCalledWith("create_midi_clip", 8, 1); // Length based on notes
      expect(liveApiSet).toHaveBeenCalledWith("name", "Arranger Clip");
      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
      expect(liveApiSet).toHaveBeenCalledWith("detail_clip", "id arranger_clip");

      expect(result).toEqual({
        id: "arranger_clip",
        type: "midi",
        view: "Arranger",
        trackIndex: 0,
        arrangerStartTime: 8,
        name: "Arranger Clip",
        notes: "1:1 C3 D3 E3",
        timeSignature: "4/4",
      });
    });

    it("should create arranger clips with exact lengths and positions", () => {
      parseNotationSpy.mockRestore();

      mockLiveApiGet({
        Track: { exists: () => true },
      });

      liveApiCall.mockImplementation((method, ...args) => {
        if (method === "create_midi_clip") {
          return ["id", "arranger_clip"];
        }
        return null;
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "id arranger_clip") return "arranger_clip";
        return "1";
      });

      const result = createClip({
        view: "Arranger",
        trackIndex: 0,
        arrangerStartTime: 8,
        count: 3,
        name: "Sequence",
        notes: "C3 1:2 D3",
      });

      // Clips should be created with exact length (2 beats) at correct positions
      expect(liveApiCall).toHaveBeenCalledWith("create_midi_clip", 8, 2); // 8 + (0 * 2)
      expect(liveApiCall).toHaveBeenCalledWith("create_midi_clip", 10, 2); // 8 + (1 * 2)
      expect(liveApiCall).toHaveBeenCalledWith("create_midi_clip", 12, 2); // 8 + (2 * 2)

      expect(result).toEqual([
        {
          id: "arranger_clip",
          type: "midi",
          view: "Arranger",
          trackIndex: 0,
          arrangerStartTime: 8,
          name: "Sequence",
          timeSignature: "4/4",
          notes: "C3 1:2 D3",
        },
        {
          id: "arranger_clip",
          type: "midi",
          view: "Arranger",
          trackIndex: 0,
          arrangerStartTime: 10,
          name: "Sequence 2",
          timeSignature: "4/4",
          notes: "C3 1:2 D3",
        },
        {
          id: "arranger_clip",
          type: "midi",
          view: "Arranger",
          trackIndex: 0,
          arrangerStartTime: 12,
          name: "Sequence 3",
          timeSignature: "4/4",
          notes: "C3 1:2 D3",
        },
      ]);
    });

    it("should throw error when track doesn't exist", () => {
      liveApiId.mockReturnValue("id 0");

      expect(() =>
        createClip({
          view: "Arranger",
          trackIndex: 99,
          arrangerStartTime: 8,
        })
      ).toThrow("createClip failed: track with index 99 does not exist");
    });
  });

  it("should set time signature when provided", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = createClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      timeSignature: "6/8",
    });

    expect(liveApiSet).toHaveBeenCalledWith("signature_numerator", 6);
    expect(liveApiSet).toHaveBeenCalledWith("signature_denominator", 8);
    expect(result.timeSignature).toBe("6/8");
  });

  it("should calculate correct clip length based on note duration", () => {
    // Restore real parseNotation for this test
    parseNotationSpy.mockRestore();

    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "1:1 t2 C3 1:3 t3 D3", // Notes at beats 0 and 2, with durations 2 and 3, so end at beat 5
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_clip", 5);
  });

  it("should return single object for count=1 and array for count>1", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    const singleResult = createClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      count: 1,
      name: "Single",
    });

    const arrayResult = createClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 1,
      count: 2,
      name: "Multiple",
    });

    expect(singleResult).toMatchObject({
      id: expect.any(String),
      type: "midi",
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      name: "Single",
      timeSignature: "4/4",
    });
    expect(singleResult.length).toBeUndefined();

    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
    expect(arrayResult[0].name).toBe("Multiple");
    expect(arrayResult[1].name).toBe("Multiple 2");
  });
});

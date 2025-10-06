import { describe, expect, it } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
  MockSequence,
} from "../../test/mock-live-api";
import { MAX_AUTO_CREATED_SCENES } from "../constants";
import { createClip } from "./create-clip";

describe("createClip", () => {
  it("should throw error when required parameters are missing", () => {
    expect(() => createClip({})).toThrow(
      "createClip failed: view parameter is required",
    );
    expect(() => createClip({ view: "session" })).toThrow(
      "createClip failed: trackIndex is required",
    );
    expect(() => createClip({ view: "session", trackIndex: 0 })).toThrow(
      "createClip failed: sceneIndex is required when view is 'Session'",
    );
    expect(() => createClip({ view: "arrangement", trackIndex: 0 })).toThrow(
      "createClip failed: arrangementStartTime is required when view is 'Arrangement'",
    );
  });

  it("should throw error when count is less than 1", () => {
    expect(() =>
      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        count: 0,
      }),
    ).toThrow("createClip failed: count must be at least 1");
  });

  it("should validate time signature early when provided", () => {
    expect(() =>
      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        timeSignature: "invalid",
      }),
    ).toThrow("Time signature must be in format");
  });

  it("should read time signature from song when not provided", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 3, signature_denominator: 4 },
    });

    const result = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "1|1 C3 2|1 D3", // Should parse with 3 beats per bar from song
    });

    expect(result).toEqual({
      sceneIndex: 0,
      id: "live_set/tracks/0/clip_slots/0/clip",
      noteCount: 2,
      timeSignature: "3/4",
      trackIndex: 0,
      type: "midi",
      view: "session",
    });

    // Verify the parsed notes were correctly added to the clip
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
            pitch: 62,
            start_time: 3,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          }, // 3 beats per bar in 3/4
        ],
      },
    );
  });

  it("should parse notes using provided time signature", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      timeSignature: "3/4",
      notes: "1|1 C3 2|1 D3", // Should parse with 3 beats per bar
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
            pitch: 62,
            start_time: 3,
            duration: 1,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ],
      },
    );
  });

  it("should correctly handle 6/8 time signature with Ableton's quarter-note beats", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      timeSignature: "6/8",
      notes: "1|1 C3 2|1 D3",
    });

    // In 6/8, beat 2|1 should be 3 Ableton beats (6 musical beats * 4/8 = 3 Ableton beats)
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "add_new_notes",
      {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 0.5,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
          {
            pitch: 62,
            start_time: 3,
            duration: 0.5,
            velocity: 100,
            probability: 1.0,
            velocity_deviation: 0,
          },
        ],
      },
    );
  });

  it("should create clip with specified length", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      length: "1:3",
      loop: false,
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      7,
    );
  });

  it("should create clip with specified length for looping clips", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      length: "2:0",
      loop: true,
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      8,
    );
  });

  it("should calculate clip length from notes when markers not provided", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "1|1 t2 C3 1|4 t1.5 D3", // Notes end at beat 4.5, which should round up to 5
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      5,
    );
  });

  it("should handle time signatures with denominators other than 4", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "1|1 t2 C3 1|2 t1.5 D3", // Notes end at beat index 2.5, which should round up to 3
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      1.5,
    ); // ends after three eighth notes, which is 1.5 quarter notes in "ableton beats"
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "add_new_notes",
      {
        notes: [
          {
            duration: 1, // LiveAPI durations are in quarter notes, so this should be half the value from the notation string
            pitch: 60,
            probability: 1,
            start_time: 0,
            velocity: 100,
            velocity_deviation: 0,
          },
          {
            duration: 0.75, // LiveAPI durations are in quarter notes, so this should be half the value from the notation string
            pitch: 62,
            probability: 1,
            start_time: 0.5,
            velocity: 100,
            velocity_deviation: 0,
          },
        ],
      },
    );
  });

  it("should create minimum 1-beat clip when empty", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      1,
    );
  });

  it("should use minimum clip length of 1 when notes are empty", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      1,
    );
  });

  describe("Session view", () => {
    it("should create a single clip with notes", () => {
      liveApiId.mockImplementation(function () {
        switch (this._path) {
          case "live_set tracks 0 clip_slots 0 clip":
            return "clip_0_0";
          default:
            return this._id;
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
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "1|1 C3 D3 E3",
        name: "New Clip",
        color: "#FF0000",
        loop: true,
        auto: "play-clip",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
        "create_clip",
        1,
      ); // Length based on notes
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 0 clip",
        }),
        "name",
        "New Clip",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 0 clip",
        }),
        "color",
        16711680,
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 0 clip",
        }),
        "looping",
        true,
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 0 clip",
        }),
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
              pitch: 62,
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
              velocity: 100,
              probability: 1.0,
              velocity_deviation: 0,
            },
          ],
        },
      );
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
        "fire",
      );

      expect(result).toEqual({
        id: "clip_0_0",
        type: "midi",
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        name: "New Clip",
        color: "#FF0000",
        loop: true,
        noteCount: 3,
        timeSignature: "4/4",
        triggered: true,
      });
    });

    it("should fire the scene when auto=play-scene", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
        Clip: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });

      const result = createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "1|1 C3",
        auto: "play-scene",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set scenes 0" }),
        "fire",
      );
      expect(result.triggered).toBe(true);
    });

    it("should throw error for invalid auto value", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        LiveSet: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
        Clip: {
          signature_numerator: 4,
          signature_denominator: 4,
        },
      });

      expect(() =>
        createClip({
          view: "session",
          trackIndex: 0,
          sceneIndex: 0,
          auto: "invalid-value",
        }),
      ).toThrow('createClip failed: unknown auto value "invalid-value"');
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
            return this._id;
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
        view: "session",
        trackIndex: 0,
        sceneIndex: 1,
        count: 3,
        name: "Loop",
        color: "#00FF00",
      });

      // Should create 3 scenes first (for slots 1, 2, 3), then 3 clips
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "create_scene",
        -1,
      ); // scene for slot 1
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "create_scene",
        -1,
      ); // scene for slot 2
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "create_scene",
        -1,
      ); // scene for slot 3
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 1" }),
        "create_clip",
        1,
      ); // clip in slot 1
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 2" }),
        "create_clip",
        1,
      ); // clip in slot 2
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 3" }),
        "create_clip",
        1,
      ); // clip in slot 3

      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 1 clip",
        }),
        "name",
        "Loop",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 2 clip",
        }),
        "name",
        "Loop 2",
      );
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({
          path: "live_set tracks 0 clip_slots 3 clip",
        }),
        "name",
        "Loop 3",
      );

      expect(result).toEqual([
        {
          id: "clip_0_1",
          type: "midi",
          view: "session",
          trackIndex: 0,
          sceneIndex: 1,
          name: "Loop",
          color: "#00FF00",
          timeSignature: "4/4",
        },
        {
          id: "clip_0_2",
          type: "midi",
          view: "session",
          trackIndex: 0,
          sceneIndex: 2,
          name: "Loop 2",
          color: "#00FF00",
          timeSignature: "4/4",
        },
        {
          id: "clip_0_3",
          type: "midi",
          view: "session",
          trackIndex: 0,
          sceneIndex: 3,
          name: "Loop 3",
          color: "#00FF00",
          timeSignature: "4/4",
        },
      ]);
    });

    it("should auto-create scenes when sceneIndex exceeds existing scenes", () => {
      mockLiveApiGet({
        LiveSet: {
          scenes: children("scene1", "scene2"), // 2 existing scenes
          signature_numerator: 4,
        },
        ClipSlot: { has_clip: new MockSequence(0, 1) },
      });

      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 4, // Needs scenes at indices 2, 3, 4
        name: "Future Clip",
      });

      // Should create 3 padding scenes (indices 2,3,4)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "create_scene",
        -1,
      ); // padding scene 1
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "create_scene",
        -1,
      ); // padding scene 2
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set" }),
        "create_scene",
        -1,
      ); // padding scene 3

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 4" }),
        "create_clip",
        1,
      );
    });

    it("should throw error if clip already exists in session view clip slot", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 1 },
        LiveSet: { signature_numerator: 4 },
      });
      expect(() =>
        createClip({
          view: "session",
          trackIndex: 0,
          sceneIndex: 0,
          name: "This Should Fail",
        }),
      ).toThrow(
        "createClip failed: a clip already exists at track 0, clip slot 0",
      );
    });

    it("should throw error if sceneIndex exceeds maximum allowed scenes", () => {
      expect(() =>
        createClip({
          view: "session",
          trackIndex: 0,
          sceneIndex: MAX_AUTO_CREATED_SCENES,
          name: "This Should Fail",
        }),
      ).toThrow(/exceeds the maximum allowed value/);
    });
  });

  describe("Arrangement view", () => {
    it("should create a single clip in arrangement", () => {
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
          return ["id", "arrangement_clip"];
        }
        return null;
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "id arrangement_clip") return "arrangement_clip";
        return this._id;
      });

      const result = createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStartTime: "3|1",
        notes: "1|1 C3 D3 E3",
        name: "Arrangement Clip",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        8,
        1,
      ); // Length based on notes
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "arrangement_clip" }),
        "name",
        "Arrangement Clip",
      );

      expect(result).toEqual({
        id: "arrangement_clip",
        type: "midi",
        view: "arrangement",
        trackIndex: 0,
        arrangementStartTime: "3|1",
        name: "Arrangement Clip",
        noteCount: 3,
        timeSignature: "4/4",
      });
    });

    it("should create arrangement clips with exact lengths and positions", () => {
      mockLiveApiGet({
        Track: { exists: () => true },
      });

      liveApiCall.mockImplementation((method, ...args) => {
        if (method === "create_midi_clip") {
          return ["id", "arrangement_clip"];
        }
        return null;
      });

      liveApiId.mockImplementation(function () {
        if (this._path === "id arrangement_clip") return "arrangement_clip";
        return this._id;
      });

      const result = createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStartTime: "3|1",
        count: 3,
        name: "Sequence",
        notes: "C3 1|2 D3",
      });

      // Clips should be created with exact length (2 beats) at correct positions
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        8,
        2,
      ); // 8 + (0 * 2)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        10,
        2,
      ); // 8 + (1 * 2)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        12,
        2,
      ); // 8 + (2 * 2)

      expect(result).toEqual([
        {
          id: "arrangement_clip",
          type: "midi",
          view: "arrangement",
          trackIndex: 0,
          arrangementStartTime: "3|1",
          name: "Sequence",
          timeSignature: "4/4",
          noteCount: 2,
        },
        {
          id: "arrangement_clip",
          type: "midi",
          view: "arrangement",
          trackIndex: 0,
          arrangementStartTime: "3|3",
          name: "Sequence 2",
          timeSignature: "4/4",
          noteCount: 2,
        },
        {
          id: "arrangement_clip",
          type: "midi",
          view: "arrangement",
          trackIndex: 0,
          arrangementStartTime: "4|1",
          name: "Sequence 3",
          timeSignature: "4/4",
          noteCount: 2,
        },
      ]);
    });

    it("should throw error when track doesn't exist", () => {
      liveApiId.mockReturnValue("id 0");

      expect(() =>
        createClip({
          view: "arrangement",
          trackIndex: 99,
          arrangementStartTime: "3|1",
        }),
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
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
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
    expect(result.timeSignature).toBe("6/8");
  });

  it("should calculate correct clip length based on note duration", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "1|1 t2 C3 1|3 t3 D3", // Notes at beats 0 and 2, with durations 2 and 3, so end at beat 5
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      5,
    );
  });

  it("should return single object for count=1 and array for count>1", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4 },
    });

    const singleResult = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      count: 1,
      name: "Single",
    });

    const arrayResult = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 1,
      count: 2,
      name: "Multiple",
    });

    expect(singleResult).toMatchObject({
      id: expect.any(String),
      type: "midi",
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      name: "Single",
      timeSignature: "4/4",
    });
    expect(singleResult.length).toBeUndefined();

    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
    expect(arrayResult[0].name).toBe("Multiple");
    expect(arrayResult[1].name).toBe("Multiple 2");
  });

  it("should filter out v0 notes when creating clips", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    const result = createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "1|1 v100 C3 v0 D3 v80 E3", // D3 should be filtered out
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

    expect(result.noteCount).toBe(2); // C3 and E3, D3 filtered out
  });

  it("should handle clips with all v0 notes filtered out", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "1|1 v0 C3 D3 E3", // All notes should be filtered out
    });

    expect(liveApiCall).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
  });

  it("should set start and loop markers when provided", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      name: "Test Clip",
      notes: "C3 D3",
      startMarker: "1|2",
      loopStart: "1|3",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0 clip" }),
      "start_marker",
      1,
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
        sceneIndex: 0,
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(result).toMatchObject({
        view: "session",
      });
    });

    it("should switch to arrangement view when creating arrangement clips with switchView=true", () => {
      mockLiveApiGet({
        LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      const result = createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStartTime: "1|1",
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
      expect(result).toMatchObject({
        view: "arrangement",
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
        sceneIndex: 0,
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
        sceneIndex: 0,
        count: 2,
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });
  });
});

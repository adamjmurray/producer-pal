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
      notes: "C3 1|1 D3 2|1", // Should parse with 3 beats per bar from song
    });

    expect(result).toEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      trackIndex: 0,
      sceneIndex: 0,
      noteCount: 2,
      length: "2:0",
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
      notes: "C3 1|1 D3 2|1", // Should parse with 3 beats per bar
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
      notes: "C3 1|1 D3 2|1",
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
      notes: "t2 C3 1|1 t1.5 D3 1|4", // Last note starts at beat 3 (0-based), rounds up to 1 bar = 4 beats
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      4,
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
      notes: "t2 C3 1|1 t1.5 D3 1|2", // Last note starts at beat 1 (0.5 Ableton beats), rounds up to 1 bar
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      3,
    ); // 1 bar in 6/8 = 3 Ableton beats
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

  it("should create 1-bar clip when empty in 4/4 time", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      4, // 1 bar in 4/4 = 4 Ableton beats
    );
  });

  it("should create 1-bar clip when empty in 6/8 time", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      3, // 1 bar in 6/8 = 3 Ableton beats (6 eighth notes = 3 quarter notes)
    );
  });

  it("should use 1-bar clip length when notes are empty in 4/4", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
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
      4, // 1 bar in 4/4 = 4 Ableton beats
    );
  });

  it("should round up to next bar based on latest note start in 4/4", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "C4 1|4.5", // Note starts at beat 3.5 (0-based), which is in bar 1, rounds up to 1 bar
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      4, // Rounds up to 1 bar = 4 Ableton beats
    );
  });

  it("should round up to next bar based on latest note start in 6/8", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 6, signature_denominator: 8 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "C4 1|5.5", // Note starts at beat 4.5 in musical beats (2.25 Ableton beats), rounds up to 1 bar
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      3, // Rounds up to 1 bar in 6/8 = 3 Ableton beats
    );
  });

  it("should round up to next bar when note start is in next bar", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 0 },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    createClip({
      view: "session",
      trackIndex: 0,
      sceneIndex: 0,
      notes: "C4 2|1", // Note starts at bar 2, beat 1 (beat 4 in 0-based), rounds up to 2 bars
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      8, // Rounds up to 2 bars = 8 Ableton beats
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
        notes: "C3 D3 E3 1|1",
        name: "New Clip",
        color: "#FF0000",
        loop: true,
        auto: "play-clip",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
        "create_clip",
        4,
      ); // Length based on notes (1 bar in 4/4)
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
        trackIndex: 0,
        sceneIndex: 0,
        noteCount: 3,
        length: "1:0",
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
        notes: "C3 1|1",
        auto: "play-scene",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set scenes 0" }),
        "fire",
      );
      expect(result).toEqual({
        id: "live_set/tracks/0/clip_slots/0/clip",
        trackIndex: 0,
        sceneIndex: 0,
        noteCount: 1,
        length: "1:0",
      });
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
        4,
      ); // clip in slot 1 (1 bar in 4/4)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 2" }),
        "create_clip",
        4,
      ); // clip in slot 2 (1 bar in 4/4)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0 clip_slots 3" }),
        "create_clip",
        4,
      ); // clip in slot 3 (1 bar in 4/4)

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
        { id: "clip_0_1", trackIndex: 0, sceneIndex: 1 },
        { id: "clip_0_2", trackIndex: 0, sceneIndex: 2 },
        { id: "clip_0_3", trackIndex: 0, sceneIndex: 3 },
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
        4,
      ); // 1 bar in 4/4
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
        notes: "C3 D3 E3 1|1",
        name: "Arrangement Clip",
      });

      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        8,
        4,
      ); // Length based on notes (1 bar in 4/4)
      expect(liveApiSet).toHaveBeenCalledWithThis(
        expect.objectContaining({ id: "arrangement_clip" }),
        "name",
        "Arrangement Clip",
      );

      expect(result).toEqual({
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStartTime: "3|1",
        noteCount: 3,
        length: "1:0",
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
        notes: "C3 1|1 D3 1|2",
      });

      // Clips should be created with exact length (4 beats = 1 bar in 4/4) at correct positions
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        8,
        4,
      ); // 8 + (0 * 4)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        12,
        4,
      ); // 8 + (1 * 4)
      expect(liveApiCall).toHaveBeenCalledWithThis(
        expect.objectContaining({ path: "live_set tracks 0" }),
        "create_midi_clip",
        16,
        4,
      ); // 8 + (2 * 4)

      expect(result).toEqual([
        {
          id: "arrangement_clip",
          trackIndex: 0,
          arrangementStartTime: "3|1",
          noteCount: 2,
          length: "1:0",
        },
        {
          id: "arrangement_clip",
          trackIndex: 0,
          arrangementStartTime: "4|1",
          noteCount: 2,
          length: "1:0",
        },
        {
          id: "arrangement_clip",
          trackIndex: 0,
          arrangementStartTime: "5|1",
          noteCount: 2,
          length: "1:0",
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
    expect(result).toEqual({
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
      sceneIndex: 0,
      notes: "t2 C3 1|1 t3 D3 1|3", // Last note starts at beat 2 (0-based), rounds up to 1 bar = 4 beats
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0 clip_slots 0" }),
      "create_clip",
      4,
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
      trackIndex: 0,
      sceneIndex: 0,
    });
    expect(singleResult.length).toBeUndefined();

    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
    expect(arrayResult[0]).toEqual({
      id: expect.any(String),
      trackIndex: 0,
      sceneIndex: 1,
    });
    expect(arrayResult[1]).toEqual({
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
      sceneIndex: 0,
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

    expect(result).toEqual({
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
      sceneIndex: 0,
      notes: "v0 C3 D3 E3 1|1", // All notes should be filtered out
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
      expect(result).toEqual({
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
        if (this._path === "id arrangement_clip") return "arrangement_clip";
        return this._id;
      });

      const result = createClip({
        view: "arrangement",
        trackIndex: 0,
        arrangementStartTime: "1|1",
        switchView: true,
      });

      expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
      expect(result).toEqual({
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStartTime: "1|1",
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

  describe("with modulations", () => {
    it("should apply velocity modulation to notes", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        signature_numerator: 4,
        signature_denominator: 4,
        scenes: children([0]),
      });

      const result = createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "v64 C3 1|1", // base velocity 64, position at 1|1
        modulations: "velocity += 20", // add 20
      });

      expect(result.id).toBeTruthy(); // Just verify ID exists

      // Check that add_new_notes was called with modulated velocity
      expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          expect.objectContaining({
            pitch: 60,
            velocity: 84, // 64 + 20
          }),
        ],
      });
    });

    it("should apply timing modulation to note start_time", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        signature_numerator: 4,
        signature_denominator: 4,
        scenes: children([0]),
      });

      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "C3 1|1", // note at position 1|1 (beat 0)
        modulations: "timing += 0.5", // add 0.5 Ableton beats
      });

      expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          expect.objectContaining({
            pitch: 60,
            start_time: 0.5, // 0 + 0.5
          }),
        ],
      });
    });

    it("should apply duration modulation", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        signature_numerator: 4,
        signature_denominator: 4,
        scenes: children([0]),
      });

      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "t1 C3 1|1", // duration 1 beat = 1 Ableton beat
        modulations: "duration += 0.5", // add 0.5
      });

      expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          expect.objectContaining({
            pitch: 60,
            duration: 1.5, // 1 + 0.5
          }),
        ],
      });
    });

    it("should apply probability modulation", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        signature_numerator: 4,
        signature_denominator: 4,
        scenes: children([0]),
      });

      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "p0.5 C3 1|1", // probability 0.5
        modulations: "probability += 0.2", // add 0.2
      });

      expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          expect.objectContaining({
            pitch: 60,
            probability: 0.7, // 0.5 + 0.2
          }),
        ],
      });
    });

    it("should clamp velocity to range 1-127", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        signature_numerator: 4,
        signature_denominator: 4,
        scenes: children([0]),
      });

      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "v120 C3 1|1 v10 D3 1|2",
        modulations: "velocity += 20", // would push first to 140, second to 30
      });

      expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          expect.objectContaining({
            pitch: 60,
            velocity: 127, // clamped to max
          }),
          expect.objectContaining({
            pitch: 62,
            velocity: 30, // within range
          }),
        ],
      });
    });

    it("should clamp probability to range 0.0-1.0", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        signature_numerator: 4,
        signature_denominator: 4,
        scenes: children([0]),
      });

      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "p0.9 C3 1|1 p0.1 D3 1|2",
        modulations: "probability += 0.2",
      });

      const callArgs = liveApiCall.mock.calls.find(
        (call) => call[0] === "add_new_notes",
      )?.[1];
      expect(callArgs.notes).toHaveLength(2);
      expect(callArgs.notes[0]).toMatchObject({
        pitch: 60,
        probability: 1.0, // clamped to max
      });
      expect(callArgs.notes[1].pitch).toBe(62);
      expect(callArgs.notes[1].probability).toBeCloseTo(0.3); // floating point safe
    });

    it("should clamp duration to minimum positive value", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        signature_numerator: 4,
        signature_denominator: 4,
        scenes: children([0]),
      });

      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "t0.1 C3 1|1",
        modulations: "duration += -1", // would make negative
      });

      expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          expect.objectContaining({
            pitch: 60,
            duration: 0.001, // clamped to minimum
          }),
        ],
      });
    });

    it("should apply multiple parameter modulations", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        signature_numerator: 4,
        signature_denominator: 4,
        scenes: children([0]),
      });

      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "v64 t1 p0.5 C3 1|1",
        modulations:
          "velocity += 10\ntiming += 0.1\nduration += 0.5\nprobability += 0.2",
      });

      expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          expect.objectContaining({
            pitch: 60,
            velocity: 74, // 64 + 10
            start_time: 0.1, // 0 + 0.1
            duration: 1.5, // 1 + 0.5
            probability: 0.7, // 0.5 + 0.2
          }),
        ],
      });
    });

    it("should apply modulation with waveform functions", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        signature_numerator: 4,
        signature_denominator: 4,
        scenes: children([0]),
      });

      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "v64 C3 1|1", // position 0, cos(0) = 1.0
        modulations: "velocity += 20 * cos(1t)", // 20 * 1.0 = 20
      });

      expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          expect.objectContaining({
            pitch: 60,
            velocity: 84, // 64 + 20
          }),
        ],
      });
    });

    it("should handle modulation errors gracefully", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        signature_numerator: 4,
        signature_denominator: 4,
        scenes: children([0]),
      });

      // Invalid modulation syntax should not crash, just skip modulation
      const result = createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        notes: "v64 C3 1|1",
        modulations: "invalid syntax!!!",
      });

      expect(result.id).toBeTruthy(); // Just verify ID exists

      // Note should be created with original velocity (no modulation applied)
      expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          expect.objectContaining({
            pitch: 60,
            velocity: 64, // unchanged
          }),
        ],
      });
    });

    it("should work with different time signatures", () => {
      mockLiveApiGet({
        ClipSlot: { has_clip: 0 },
        signature_numerator: 6,
        signature_denominator: 8,
        scenes: children([0]),
      });

      createClip({
        view: "session",
        trackIndex: 0,
        sceneIndex: 0,
        timeSignature: "6/8",
        notes: "v64 C3 1|1", // position 0
        modulations: "velocity += 20 * cos(1:0t)", // 1 bar in 6/8 = 6 beats
      });

      // At position 0, cos should be 1.0, so modulation is +20
      expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          expect.objectContaining({
            pitch: 60,
            velocity: 84, // 64 + 20
          }),
        ],
      });
    });
  });
});

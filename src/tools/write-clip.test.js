// src/tools/write-clip.test.js
import { describe, expect, it, vi } from "vitest";
import {
  children,
  expectedClip,
  liveApiCall,
  liveApiId,
  liveApiPath,
  liveApiSet,
  mockLiveApiGet,
  MockSequence,
} from "../mock-live-api";
import * as notation from "../notation/notation";
import { MAX_AUTO_CREATED_SCENES, writeClip } from "./write-clip";

// Spy on notation functions
const parseNotationSpy = vi.spyOn(notation, "parseNotation");

describe("writeClip", () => {
  beforeEach(() => {
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

  it("creates a new clip with notes when no clip exists", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip_0_0";
      }
    });
    liveApiPath.mockImplementation(function () {
      switch (this._id) {
        case "clip_0_0":
          return "live_set tracks 0 clip_slots 0 clip";
      }
    });
    mockLiveApiGet({
      ClipSlot: { has_clip: new MockSequence(0, 1) },
      clip_0_0: { is_midi_clip: 1, length: 4 },
    });

    const result = writeClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "1:1 C3 D3 E3",
      name: "New Clip",
      color: "#FF0000",
      loop: true,
      autoplay: true,
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_clip", 4);
    expect(liveApiSet).toHaveBeenCalledWith("name", "New Clip");
    expect(liveApiSet).toHaveBeenCalledWith("color", 16711680);
    expect(liveApiSet).toHaveBeenCalledWith("looping", true);
    expect(liveApiCall).toHaveBeenCalledWith(
      "add_new_notes",
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ pitch: 60, start_time: 0, duration: 1, velocity: 100 }),
          expect.objectContaining({ pitch: 62, start_time: 0, duration: 1, velocity: 100 }),
          expect.objectContaining({ pitch: 64, start_time: 0, duration: 1, velocity: 100 }),
        ]),
      })
    );
    expect(liveApiCall).toHaveBeenCalledWith("fire");
    expect(result).toEqual(
      expectedClip({
        id: "clip_0_0",
        type: "midi",
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 0,
        isTriggered: true,
      })
    );
  });

  it("creates a new arranger clip", () => {
    mockLiveApiGet({
      Track: { exists: () => true },
    });

    liveApiCall.mockImplementation((method, ...args) => {
      if (method === "create_midi_clip") {
        return ["id", "clip_0"];
      }
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: [] });
      }
      if (method === "getChildIds" && args[0] === "arrangement_clips") {
        return ["id", "arrange_clip_1"];
      }
      return null;
    });

    liveApiId.mockImplementation(function () {
      if (this.path === "arrange_clip_1") return "arrange_clip_1";
      return "1";
    });

    const result = writeClip({
      view: "Arranger",
      trackIndex: 0,
      arrangerStartTime: 8,
      notes: "1:1 C3 D3 E3",
      name: "New Arranger Clip",
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_midi_clip", 8, 4);
    expect(liveApiSet).toHaveBeenCalledWith("name", "New Arranger Clip");
    expect(liveApiCall).toHaveBeenCalledWith(
      "add_new_notes",
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ pitch: 60, start_time: 0, duration: 1, velocity: 100 }),
          expect.objectContaining({ pitch: 62, start_time: 0, duration: 1, velocity: 100 }),
          expect.objectContaining({ pitch: 64, start_time: 0, duration: 1, velocity: 100 }),
        ]),
      })
    );
  });

  it("updates an existing clip by ID", () => {
    mockLiveApiGet({
      existing_clip: { exists: () => true },
    });

    liveApiId.mockImplementation(function () {
      if (this.path === "id existing_clip") return "existing_clip";
      return "1";
    });

    writeClip({
      view: "Session",
      clipId: "id existing_clip",
      name: "Updated Clip",
      color: "#00FF00",
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Updated Clip");
    expect(liveApiSet).toHaveBeenCalledWith("color", 65280);
    expect(liveApiCall).not.toHaveBeenCalledWith("remove_notes_extended", expect.anything());
  });

  it("throws error when required parameters are missing", () => {
    expect(() =>
      writeClip({
        trackIndex: 0,
        clipSlotIndex: 0,
      })
    ).toThrow(/view parameter is required/);

    expect(() =>
      writeClip({
        view: "Session",
        clipSlotIndex: 0,
      })
    ).toThrow(/trackIndex is required/);

    expect(() =>
      writeClip({
        view: "Session",
        trackIndex: 0,
      })
    ).toThrow(/clipSlotIndex is required/);

    expect(() =>
      writeClip({
        view: "Arranger",
        trackIndex: 0,
      })
    ).toThrow(/arrangerStartTime is required/);
  });

  it("ignores autoplay parameter for arranger clips", () => {
    mockLiveApiGet({
      Track: { exists: () => true },
    });

    liveApiCall.mockImplementation((method, ...args) => {
      if (method === "create_midi_clip") {
        return ["id", "clip_0"];
      }
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: [] });
      }
      if (method === "getChildIds" && args[0] === "arrangement_clips") {
        return ["id", "arrange_clip_1"];
      }
      return null;
    });

    liveApiId.mockImplementation(function () {
      if (this.path === "arrange_clip_1") return "arrange_clip_1";
      return "1";
    });

    writeClip({
      view: "Arranger",
      trackIndex: 0,
      arrangerStartTime: 8,
      autoplay: true,
    });

    expect(liveApiCall).not.toHaveBeenCalledWith("fire");
  });

  // E2E test with real BarBeat notation
  it("calculates correct clip length based on note duration (e2e)", () => {
    // Restore real parseNotation for this test
    parseNotationSpy.mockRestore();

    mockLiveApiGet({
      ClipSlot: { has_clip: new MockSequence(0, 1) },
      Clip: { length: 8 },
    });

    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: [] });
      }
      return null;
    });

    const result = writeClip({
      view: "Session",
      trackIndex: 3,
      clipSlotIndex: 0,
      notes: "1:1 t2 C3 1:3 t3 D3", // Notes at beats 0 and 2, with durations 2 and 3, so end at beat 5
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_clip", 5);
    expect(liveApiCall).toHaveBeenCalledWith(
      "add_new_notes",
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ start_time: 0, duration: 2 }),
          expect.objectContaining({ start_time: 2, duration: 3 }),
        ]),
      })
    );
  });

  it("uses minimum clip length of 4 when notes are short", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: new MockSequence(0, 1) },
    });

    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: [] });
      }
      return null;
    });

    parseNotationSpy.mockReturnValue([{ pitch: 60, start_time: 0, duration: 1, velocity: 100 }]);

    writeClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "1:1 C3",
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_clip", 4);
  });

  // E2E test with real BarBeat notation
  it("should handle complex BarBeat timing (e2e)", () => {
    // Restore real parseNotation for this test
    parseNotationSpy.mockRestore();

    writeClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "1:1 v80 t2 C4 1:3 v120 t1 D4 1:4 E4",
    });

    expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        {
          pitch: 72,
          velocity: 80,
          start_time: 0,
          duration: 2,
        },
        {
          pitch: 74,
          velocity: 120,
          start_time: 2,
          duration: 1,
        },
        {
          pitch: 76,
          velocity: 120,
          start_time: 3,
          duration: 1,
        },
      ],
    });
  });

  it("returns clear error message for invalid BarBeat syntax", () => {
    // Restore real parseNotation for this test
    parseNotationSpy.mockRestore();

    const invalidSyntax = "C3z1.5";
    expect(() =>
      writeClip({
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 0,
        notes: invalidSyntax,
      })
    ).toThrow(/BarBeat syntax error.*Expected.*but.*found/);
  });

  it("auto-creates scenes when clipSlotIndex exceeds existing scenes", () => {
    mockLiveApiGet({
      LiveSet: { scenes: children("scene1", "scene2", "scene3") },
    });

    writeClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 5,
      name: "Auto-created scene clip",
    });

    const createSceneCalls = liveApiCall.mock.calls.filter(
      ([liveApiFunction, ..._args]) => liveApiFunction === "create_scene"
    );
    expect(createSceneCalls.length).toBe(3);
    createSceneCalls.forEach((createSceneCall, callIndex) => {
      expect(liveApiCall.mock.instances[callIndex].path).toBe("live_set");
      expect(createSceneCall).toEqual(["create_scene", -1]);
    });
  });

  it("if clipSlotIndex exceeds maximum allowed scenes", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: new MockSequence(0, 1) },
    });

    expect(() =>
      writeClip({
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: MAX_AUTO_CREATED_SCENES,
        name: "This Should Fail",
      })
    ).toThrow(/exceeds the maximum allowed value/);

    expect(liveApiCall).not.toHaveBeenCalledWith("create_scene", expect.any(Number));
  });

  it("removes all existing notes when updating a clip with new notes", () => {
    liveApiId.mockImplementation(function () {
      if (this.path === "id existing_clip") return "existing_clip";
      return "1";
    });
    mockLiveApiGet({
      existing_clip: { exists: () => true },
    });

    writeClip({
      view: "Session",
      clipId: "existing_clip",
      notes: "1:1 C3 D3 E3",
    });

    expect(liveApiCall).toHaveBeenNthCalledWith(1, "remove_notes_extended", 0, 127, 0, 1000000);
    expect(liveApiCall.mock.instances[0].id).toBe("existing_clip");

    expect(liveApiCall).toHaveBeenNthCalledWith(2, "add_new_notes", {
      notes: [
        {
          duration: 1,
          pitch: 60,
          start_time: 0,
          velocity: 100,
        },
        {
          duration: 1,
          pitch: 62,
          start_time: 0,
          velocity: 100,
        },
        {
          duration: 1,
          pitch: 64,
          start_time: 0,
          velocity: 100,
        },
      ],
    });
  });

  it("switches to the correct view when creating or updating clips", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: new MockSequence(0, 1) },
      Track: { exists: () => true },
    });

    liveApiCall.mockImplementation((method, ...args) => {
      if (method === "create_midi_clip") {
        return ["id", "clip_0"];
      }
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: [] });
      }
      return null;
    });

    // Test Session view
    writeClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      name: "Session View Clip",
    });

    const sessionViewCall = liveApiCall.mock.calls.find((call) => call[0] === "show_view" && call[1] === "Session");
    expect(sessionViewCall).toBeDefined();
    expect(sessionViewCall[1]).toBe("Session");

    liveApiCall.mockClear();

    // Test Arranger view
    writeClip({
      view: "Arranger",
      trackIndex: 0,
      arrangerStartTime: 8,
      name: "Arranger View Clip",
    });

    const arrangerViewCall = liveApiCall.mock.calls.find((call) => call[0] === "show_view" && call[1] === "Arranger");
    expect(arrangerViewCall).toBeDefined();
    expect(arrangerViewCall[1]).toBe("Arranger");
  });
});

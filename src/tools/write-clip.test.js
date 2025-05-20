// src/tools/write-clip.test.js
import { describe, expect, it } from "vitest";
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
import { MAX_AUTO_CREATED_SCENES, writeClip } from "./write-clip";

describe("writeClip", () => {
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
      ClipSlot: { has_clip: new MockSequence(0, 1) }, // starts non-existent and then we create one, which is read by readClip() for the result value
      clip_0_0: { is_midi_clip: 1, length: 4 },
    });

    const result = writeClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "C3 D3 E3",
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
          expect.objectContaining({ pitch: 60, start_time: 0, duration: 1, velocity: 70 }),
          expect.objectContaining({ pitch: 62, start_time: 1, duration: 1, velocity: 70 }),
          expect.objectContaining({ pitch: 64, start_time: 2, duration: 1, velocity: 70 }),
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
      notes: "C3 D3 E3",
      name: "New Arranger Clip",
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_midi_clip", 8, 4);
    expect(liveApiSet).toHaveBeenCalledWith("name", "New Arranger Clip");
    expect(liveApiCall).toHaveBeenCalledWith(
      "add_new_notes",
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ pitch: 60, start_time: 0, duration: 1, velocity: 70 }),
          expect.objectContaining({ pitch: 62, start_time: 1, duration: 1, velocity: 70 }),
          expect.objectContaining({ pitch: 64, start_time: 2, duration: 1, velocity: 70 }),
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
      view: "Session", // Should work for either Session or Arranger
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
        // Missing view
        trackIndex: 0,
        clipSlotIndex: 0,
      })
    ).toThrow(/view parameter is required/);

    expect(() =>
      writeClip({
        view: "Session",
        // Missing trackIndex and clipId
        clipSlotIndex: 0,
      })
    ).toThrow(/trackIndex is required/);

    expect(() =>
      writeClip({
        view: "Session",
        trackIndex: 0,
        // Missing clipSlotIndex and clipId
      })
    ).toThrow(/clipSlotIndex is required/);

    expect(() =>
      writeClip({
        view: "Arranger",
        trackIndex: 0,
        // Missing arrangerStartTime and clipId
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
      autoplay: true, // Should be ignored for arranger clips
    });

    // Fire should not be called for arranger clips
    expect(liveApiCall).not.toHaveBeenCalledWith("fire");
  });

  it("calculates correct clip length based on note duration", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: new MockSequence(0, 1) }, // starts non-existent and then we create one, which is read by readClip() for the result value
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
      notes: "C3n2 D3n3", // Notes extend to 5 beats
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
      ClipSlot: { has_clip: new MockSequence(0, 1) }, // starts non-existent and then we create one, which is read by readClip() for the result value
    });

    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: [] });
      }
      return null;
    });

    writeClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "C3", // Only 1 beat
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_clip", 4);
  });

  it("should handle TimeUntilNext in the toneLang string", () => {
    const toneLangString = "C4n4t2 D4n4t2 E4n.5";

    writeClip({
      view: "Session",
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: toneLangString,
    });

    expect(liveApiCall).toHaveBeenCalledWith("add_new_notes", {
      notes: [
        {
          pitch: 72,
          velocity: 70,
          start_time: 0,
          duration: 4,
        },
        {
          pitch: 74,
          velocity: 70,
          start_time: 2,
          duration: 4,
        },
        {
          pitch: 76,
          velocity: 70,
          start_time: 4,
          duration: 0.5,
        },
      ],
    });
  });

  it("returns clear error message for invalid ToneLang syntax", () => {
    const invalidSyntax = "C3z1.5";
    expect(() =>
      writeClip({
        view: "Session",
        trackIndex: 0,
        clipSlotIndex: 0,
        notes: invalidSyntax,
      })
    ).toThrow(/ToneLang syntax error.*Unexpected 'z'.*Valid syntax includes/);
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
    // Mock an existing clip
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
      notes: "C3 D3 E3",
    });

    expect(liveApiCall).toHaveBeenNthCalledWith(1, "remove_notes_extended", 0, 127, 0, 1000000);
    expect(liveApiCall.mock.instances[0].id).toBe("existing_clip");

    expect(liveApiCall).toHaveBeenNthCalledWith(2, "add_new_notes", {
      notes: [
        {
          duration: 1,
          pitch: 60,
          start_time: 0,
          velocity: 70,
        },
        {
          duration: 1,
          pitch: 62,
          start_time: 1,
          velocity: 70,
        },
        {
          duration: 1,
          pitch: 64,
          start_time: 2,
          velocity: 70,
        },
      ],
    });
  });

  it("switches to the correct view when creating or updating clips", () => {
    // Mock LiveAPI behavior
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

    // Find the show_view call for Session
    const sessionViewCall = liveApiCall.mock.calls.find((call) => call[0] === "show_view" && call[1] === "Session");
    expect(sessionViewCall).toBeDefined();
    expect(sessionViewCall[1]).toBe("Session");

    // Reset mock to check Arranger view call separately
    liveApiCall.mockClear();

    // Test Arranger view
    writeClip({
      view: "Arranger",
      trackIndex: 0,
      arrangerStartTime: 8,
      name: "Arranger View Clip",
    });

    // Find the show_view call for Arranger
    const arrangerViewCall = liveApiCall.mock.calls.find((call) => call[0] === "show_view" && call[1] === "Arranger");
    expect(arrangerViewCall).toBeDefined();
    expect(arrangerViewCall[1]).toBe("Arranger");
  });
});

// device/tool-write-clip.test.js
import { describe, expect, it } from "vitest";
import { children, liveApiCall, liveApiSet, mockLiveApiGet, MockSequence } from "./mock-live-api";
import { MAX_AUTO_CREATED_SCENES, writeClip } from "./tool-write-clip";

describe("writeClip", () => {
  it("creates a new clip with notes when no clip exists", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: new MockSequence(0, 1) }, // starts non-existent and then we create one, which is read by readClip() for the result value
      Clip: { length: 4 },
    });

    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: [] });
      }
      return null;
    });

    const result = writeClip({
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
    expect(result.type).toBe("midi");
    expect(result.trackIndex).toBe(0);
    expect(result.clipSlotIndex).toBe(0);
  });

  it("updates an existing clip when deleteExistingNotes is true", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 1 },
      Clip: { length: 4 },
    });

    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: [] });
      }
      return null;
    });

    const result = writeClip({
      trackIndex: 1,
      clipSlotIndex: 2,
      notes: "F3 G3",
      deleteExistingNotes: true,
    });

    expect(liveApiCall).not.toHaveBeenCalledWith("create_clip", expect.any(Number));
    expect(liveApiCall).toHaveBeenCalledWith("remove_notes_extended", 0, 127, 0, 4);
    expect(liveApiCall).toHaveBeenCalledWith(
      "add_new_notes",
      expect.objectContaining({
        notes: expect.arrayContaining([
          expect.objectContaining({ pitch: 65, start_time: 0, duration: 1, velocity: 70 }),
          expect.objectContaining({ pitch: 67, start_time: 1, duration: 1, velocity: 70 }),
        ]),
      })
    );
    expect(result.trackIndex).toBe(1);
    expect(result.clipSlotIndex).toBe(2);
  });

  it("only updates properties when notes are not provided", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: 1 },
      Clip: { length: 4 },
    });

    liveApiCall.mockImplementation((method) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: [] });
      }
      return null;
    });

    const result = writeClip({
      trackIndex: 2,
      clipSlotIndex: 1,
      name: "Updated Clip",
      color: "#00FF00",
      loop_start: 1,
      loop_end: 3,
    });

    expect(liveApiSet).toHaveBeenCalledWith("name", "Updated Clip");
    expect(liveApiSet).toHaveBeenCalledWith("color", 65280);
    expect(liveApiSet).toHaveBeenCalledWith("loop_start", 1);
    expect(liveApiSet).toHaveBeenCalledWith("loop_end", 3);
    expect(liveApiCall).not.toHaveBeenCalledWith("add_new_notes", expect.any(Object));
    expect(result.type).toBe("midi");
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
      trackIndex: 0,
      clipSlotIndex: 0,
      notes: "C3", // Only 1 beat
    });

    expect(liveApiCall).toHaveBeenCalledWith("create_clip", 4);
  });

  it("should handle TimeUntilNext in the toneLang string", () => {
    const toneLangString = "C4n4t2 D4n4t2 E4n.5";

    writeClip({
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
    const invalidSyntax = "C3*1.5";
    expect(() =>
      writeClip({
        trackIndex: 0,
        clipSlotIndex: 0,
        notes: invalidSyntax,
      })
    ).toThrow(/ToneLang syntax error.*Unexpected '\*'.*Valid syntax includes/);
  });

  it("auto-creates scenes when clipSlotIndex exceeds existing scenes", () => {
    mockLiveApiGet({
      LiveSet: { scenes: children("scene1", "scene2", "scene3") },
    });

    writeClip({
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

  it("throws an error if clipSlotIndex exceeds maximum allowed scenes", () => {
    mockLiveApiGet({
      ClipSlot: { has_clip: new MockSequence(0, 1) },
    });

    expect(() =>
      writeClip({
        trackIndex: 0,
        clipSlotIndex: MAX_AUTO_CREATED_SCENES,
        name: "This Should Fail",
      })
    ).toThrow(/exceeds the maximum allowed value/);

    expect(liveApiCall).not.toHaveBeenCalledWith("create_scene", expect.any(Number));
  });
});

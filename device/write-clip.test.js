// device/write-clip.test.js
import { describe, it, expect, vi } from "vitest";
import { liveApiCall, liveApiSet, mockLiveApiGet, MockSequence } from "./mock-live-api";
import { writeClip } from "./write-clip";

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
      notes: "C3*2 D3*3", // Notes extend to 5 beats
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
});

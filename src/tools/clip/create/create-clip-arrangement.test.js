import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { createClip } from "./create-clip.js";

describe("createClip - arrangement view", () => {
  it("should create a single clip in arrangement", () => {
    mockLiveApiGet({
      Track: { exists: () => true },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      arrangement_clip: { length: 4 }, // 1 bar in 4/4 = 4 beats
    });

    liveApiCall.mockImplementation((method, ..._args) => {
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
      arrangementStart: "3|1",
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

    expect(result).toStrictEqual({
      id: "arrangement_clip",
      trackIndex: 0,
      arrangementStart: "3|1",
      noteCount: 3,
      length: "1:0",
    });
  });

  it("should create arrangement clips at specified positions", () => {
    mockLiveApiGet({
      Track: { exists: () => true },
      LiveSet: { signature_numerator: 4, signature_denominator: 4 },
      arrangement_clip: { length: 4 }, // 1 bar in 4/4 = 4 beats
    });

    liveApiCall.mockImplementation((method, ..._args) => {
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
      arrangementStart: "3|1,4|1,5|1", // Three explicit positions
      name: "Sequence",
      notes: "C3 1|1 D3 1|2",
    });

    // Clips should be created with exact length (4 beats = 1 bar in 4/4) at specified positions
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "create_midi_clip",
      8,
      4,
    ); // 3|1 = 8 beats
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "create_midi_clip",
      12,
      4,
    ); // 4|1 = 12 beats
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "create_midi_clip",
      16,
      4,
    ); // 5|1 = 16 beats

    expect(result).toStrictEqual([
      {
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStart: "3|1",
        noteCount: 2,
        length: "1:0",
      },
      {
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStart: "4|1",
        noteCount: 2,
        length: "1:0",
      },
      {
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStart: "5|1",
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
        arrangementStart: "3|1",
      }),
    ).toThrow("createClip failed: track 99 does not exist");
  });

  it("should emit warning and return empty array when arrangement clip creation fails", () => {
    liveApiId.mockReturnValue("id 1");
    liveApiCall.mockReturnValue("id 999");

    // Mock the clip to not exist after creation
    const originalExists = global.LiveAPI.prototype.exists;

    global.LiveAPI.prototype.exists = vi.fn(function () {
      // Track exists, but clip doesn't
      if (this._path === "live_set tracks 0") {
        return true;
      }

      return false;
    });

    // Runtime errors during clip creation are now warnings, not fatal errors
    const result = createClip({
      view: "arrangement",
      trackIndex: 0,
      arrangementStart: "1|1",
      notes: "C4 1|1",
    });

    // Should return empty array (no clips created)
    expect(result).toStrictEqual([]);

    global.LiveAPI.prototype.exists = originalExists;
  });
});

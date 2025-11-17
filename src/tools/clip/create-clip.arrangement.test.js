import { describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiSet,
  mockLiveApiGet,
} from "../../test/mock-live-api";
import { createClip } from "./create-clip";

describe("createClip - arrangement view", () => {
  it("should create a single clip in arrangement", () => {
    mockLiveApiGet({
      Track: { exists: () => true },
      LiveSet: { signature_numerator: 4 },
      Clip: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
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

    expect(result).toEqual({
      id: "arrangement_clip",
      trackIndex: 0,
      arrangementStart: "3|1",
      noteCount: 3,
      length: "1:0",
    });
  });

  it("should create arrangement clips with exact lengths and positions", () => {
    mockLiveApiGet({
      Track: { exists: () => true },
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
    ).toThrow("createClip failed: track with index 99 does not exist");
  });
});

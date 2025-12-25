import { describe, expect, it } from "vitest";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "../../../test/mock-live-api.js";
import { readLiveSet } from "../read-live-set.js";

describe("readLiveSet - cue points", () => {
  it("should not include cue points by default", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set_id";
      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Set",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        scale_mode: 0,
        tracks: [],
        scenes: [],
        cue_points: children("cue1"),
      },
    });

    const result = readLiveSet({ include: [] });

    expect(result.cuePoints).toBeUndefined();
  });

  it("should include cue points when requested", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "id cue1") return "cue1";
      if (this._path === "id cue2") return "cue2";
      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Set",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        scale_mode: 0,
        tracks: [],
        scenes: [],
        cue_points: children("cue1", "cue2"),
      },
      cue1: {
        name: "Intro",
        time: 0,
      },
      cue2: {
        name: "Verse",
        time: 16,
      },
    });

    const result = readLiveSet({ include: ["cue-points"] });

    expect(result.cuePoints).toEqual([
      { id: "cue-0", name: "Intro", time: "1|1" },
      { id: "cue-1", name: "Verse", time: "5|1" },
    ]);
  });

  it("should handle empty cue points array", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set_id";
      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Set",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        scale_mode: 0,
        tracks: [],
        scenes: [],
        cue_points: [],
      },
    });

    const result = readLiveSet({ include: ["cue-points"] });

    expect(result.cuePoints).toEqual([]);
  });

  it("should format cue times correctly in different time signatures", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "id cue1") return "cue1";
      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Set",
        tempo: 120,
        signature_numerator: 3,
        signature_denominator: 4,
        scale_mode: 0,
        tracks: [],
        scenes: [],
        cue_points: children("cue1"),
      },
      cue1: {
        name: "Chorus",
        time: 6, // 6 quarter notes = bar 3, beat 1 in 3/4
      },
    });

    const result = readLiveSet({ include: ["cue-points"] });

    expect(result.cuePoints).toEqual([
      { id: "cue-0", name: "Chorus", time: "3|1" },
    ]);
  });

  it("should include cue points with wildcard include", () => {
    liveApiId.mockImplementation(function () {
      if (this._path === "live_set") return "live_set_id";
      if (this._path === "id cue1") return "cue1";
      return this._id;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Set",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        scale_mode: 0,
        tracks: [],
        scenes: [],
        cue_points: children("cue1"),
      },
      cue1: {
        name: "Bridge",
        time: 32,
      },
    });

    const result = readLiveSet({ include: ["*"] });

    expect(result.cuePoints).toEqual([
      { id: "cue-0", name: "Bridge", time: "9|1" },
    ]);
  });
});

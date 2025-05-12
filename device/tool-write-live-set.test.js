// device/tool-write-live-set.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiSet } from "./mock-live-api";
import { writeLiveSet } from "./tool-write-live-set";

// Mock readLiveSet since it's used in writeLiveSet
vi.mock("./tool-read-live-set", () => ({
  readLiveSet: vi.fn().mockReturnValue({
    id: "live_set_id",
    name: "Test Live Set",
    isPlaying: true,
    tempo: 120,
    timeSignature: "4/4",
  }),
}));

// TODO: sanity check the result values in here

describe("writeLiveSet", () => {
  it("should update transport state", () => {
    const result = writeLiveSet({ isPlaying: false });

    expect(liveApiSet).toHaveBeenCalledWith("is_playing", false);
    expect(result).toBeDefined();
  });

  it("should update tempo", () => {
    const result = writeLiveSet({ tempo: 140 });

    expect(liveApiSet).toHaveBeenCalledWith("tempo", 140);
    expect(result).toBeDefined();
  });

  it("should throw error for invalid tempo", () => {
    expect(() => writeLiveSet({ tempo: 10 })).toThrow("Tempo must be between");
    expect(() => writeLiveSet({ tempo: 1000 })).toThrow("Tempo must be between");
  });

  it("should update time signature", () => {
    const result = writeLiveSet({ timeSignature: "3/4" });

    expect(liveApiSet).toHaveBeenCalledWith("signature_numerator", 3);
    expect(liveApiSet).toHaveBeenCalledWith("signature_denominator", 4);
    expect(result).toBeDefined();
  });

  it("should throw error for invalid time signature format", () => {
    expect(() => writeLiveSet({ timeSignature: "invalid" })).toThrow("Time signature must be in format");
    expect(() => writeLiveSet({ timeSignature: "3-4" })).toThrow("Time signature must be in format");
  });

  it("should stop all clips when requested", () => {
    const result = writeLiveSet({ stopAllClips: true });

    expect(liveApiCall).toHaveBeenCalledWith("stop_all_clips");
    expect(result).toBeDefined();
  });

  it("should update multiple properties simultaneously", () => {
    const result = writeLiveSet({
      isPlaying: true,
      tempo: 125,
      timeSignature: "6/8",
      stopAllClips: false,
    });

    expect(liveApiSet).toHaveBeenCalledWith("is_playing", true);
    expect(liveApiSet).toHaveBeenCalledWith("tempo", 125);
    expect(liveApiSet).toHaveBeenCalledWith("signature_numerator", 6);
    expect(liveApiSet).toHaveBeenCalledWith("signature_denominator", 8);
    expect(liveApiCall).not.toHaveBeenCalledWith("stop_all_clips");
    expect(result).toBeDefined();
  });
});

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
  it("should update transport state", async () => {
    const result = await writeLiveSet({ isPlaying: false });

    expect(liveApiSet).toHaveBeenCalledWith("is_playing", false);
    expect(result).toBeDefined();
  });

  it("should update tempo", async () => {
    const result = await writeLiveSet({ tempo: 140 });

    expect(liveApiSet).toHaveBeenCalledWith("tempo", 140);
    expect(result).toBeDefined();
  });

  it("should throw error for invalid tempo", async () => {
    await expect(() => writeLiveSet({ tempo: 10 })).rejects.toThrow("Tempo must be between");
    await expect(() => writeLiveSet({ tempo: 1000 })).rejects.toThrow("Tempo must be between");
  });

  it("should update time signature", async () => {
    const result = await writeLiveSet({ timeSignature: "3/4" });

    expect(liveApiSet).toHaveBeenCalledWith("signature_numerator", 3);
    expect(liveApiSet).toHaveBeenCalledWith("signature_denominator", 4);
    expect(result).toBeDefined();
  });

  it("should throw error for invalid time signature format", async () => {
    await expect(() => writeLiveSet({ timeSignature: "invalid" })).rejects.toThrow("Time signature must be in format");
    await expect(() => writeLiveSet({ timeSignature: "3-4" })).rejects.toThrow("Time signature must be in format");
  });

  it("should stop all clips when requested", async () => {
    const result = await writeLiveSet({ stopAllClips: true });
    expect(liveApiCall).toHaveBeenCalledWith("stop_all_clips", 0);
    expect(result).toBeDefined();
  });

  it("should update multiple properties simultaneously", async () => {
    const result = await writeLiveSet({
      isPlaying: true,
      tempo: 125,
      timeSignature: "6/8",
      stopAllClips: false,
    });

    expect(liveApiSet).toHaveBeenCalledWith("is_playing", true);
    expect(liveApiSet).toHaveBeenCalledWith("tempo", 125);
    expect(liveApiSet).toHaveBeenCalledWith("signature_numerator", 6);
    expect(liveApiSet).toHaveBeenCalledWith("signature_denominator", 8);
    expect(liveApiCall).not.toHaveBeenCalledWith("stop_all_clips", 0);
    expect(result).toBeDefined();
  });

  it("should switch to Arranger view when requested", async () => {
    const result = await writeLiveSet({ view: "Arranger" });
    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
    expect(result).toBeDefined();
  });

  it("should switch to Session view when requested", async () => {
    const result = await writeLiveSet({ view: "Session" });
    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
    expect(result).toBeDefined();
  });

  it("should update multiple properties including view simultaneously", async () => {
    const result = await writeLiveSet({
      isPlaying: true,
      tempo: 125,
      timeSignature: "6/8",
      view: "Arranger",
      stopAllClips: false,
    });
    expect(liveApiSet).toHaveBeenCalledWith("is_playing", true);
    expect(liveApiSet).toHaveBeenCalledWith("tempo", 125);
    expect(liveApiSet).toHaveBeenCalledWith("signature_numerator", 6);
    expect(liveApiSet).toHaveBeenCalledWith("signature_denominator", 8);
    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
    expect(liveApiCall).not.toHaveBeenCalledWith("stop_all_clips", 0);
    expect(result).toBeDefined();
  });

  it("should set back to arranger when requested", async () => {
    const result = await writeLiveSet({ followsArranger: true });
    expect(liveApiSet).toHaveBeenCalledWith("back_to_arranger", 0);
    expect(result).toBeDefined();
  });
});

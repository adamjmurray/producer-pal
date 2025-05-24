// src/tools/update-song.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiSet } from "../mock-live-api";
import { updateSong } from "./update-song";

describe("updateSong", () => {
  it("should update tempo", () => {
    const result = updateSong({ tempo: 140 });
    expect(liveApiSet).toHaveBeenCalledWith("tempo", 140);
    expect(result).toBeDefined();
  });

  it("should throw error for invalid tempo", () => {
    expect(() => updateSong({ tempo: 10 })).toThrow("Tempo must be between");
    expect(() => updateSong({ tempo: 1000 })).toThrow("Tempo must be between");
  });

  it("should update time signature", () => {
    const result = updateSong({ timeSignature: "3/4" });
    expect(liveApiSet).toHaveBeenCalledWith("signature_numerator", 3);
    expect(liveApiSet).toHaveBeenCalledWith("signature_denominator", 4);
    expect(result).toBeDefined();
  });

  it("should throw error for invalid time signature format", () => {
    expect(() => updateSong({ timeSignature: "invalid" })).toThrow("Time signature must be in format");
    expect(() => updateSong({ timeSignature: "3-4" })).toThrow("Time signature must be in format");
  });

  it("should update multiple properties simultaneously", () => {
    const result = updateSong({
      tempo: 125,
      timeSignature: "6/8",
      view: "Arranger",
    });
    expect(liveApiSet).toHaveBeenCalledWith("tempo", 125);
    expect(liveApiSet).toHaveBeenCalledWith("signature_numerator", 6);
    expect(liveApiSet).toHaveBeenCalledWith("signature_denominator", 8);
    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
    expect(result).toBeDefined();
  });

  it("should switch to Arranger view when requested", () => {
    const result = updateSong({ view: "Arranger" });
    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
    expect(result).toBeDefined();
  });

  it("should switch to Session view when requested", () => {
    const result = updateSong({ view: "Session" });
    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
    expect(result).toBeDefined();
  });
});

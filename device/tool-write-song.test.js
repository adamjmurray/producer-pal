// device/tool-write-song.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiSet } from "./mock-live-api";
import { writeSong } from "./tool-write-song";

describe("writeSong", () => {
  it("should update tempo", () => {
    const result = writeSong({ tempo: 140 });
    expect(liveApiSet).toHaveBeenCalledWith("tempo", 140);
    expect(result).toBeDefined();
  });

  it("should throw error for invalid tempo", () => {
    expect(() => writeSong({ tempo: 10 })).toThrow("Tempo must be between");
    expect(() => writeSong({ tempo: 1000 })).toThrow("Tempo must be between");
  });

  it("should update time signature", () => {
    const result = writeSong({ timeSignature: "3/4" });
    expect(liveApiSet).toHaveBeenCalledWith("signature_numerator", 3);
    expect(liveApiSet).toHaveBeenCalledWith("signature_denominator", 4);
    expect(result).toBeDefined();
  });

  it("should throw error for invalid time signature format", () => {
    expect(() => writeSong({ timeSignature: "invalid" })).toThrow("Time signature must be in format");
    expect(() => writeSong({ timeSignature: "3-4" })).toThrow("Time signature must be in format");
  });

  it("should update multiple properties simultaneously", () => {
    const result = writeSong({
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
    const result = writeSong({ view: "Arranger" });
    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Arranger");
    expect(result).toBeDefined();
  });

  it("should switch to Session view when requested", () => {
    const result = writeSong({ view: "Session" });
    expect(liveApiCall).toHaveBeenCalledWith("show_view", "Session");
    expect(result).toBeDefined();
  });
});

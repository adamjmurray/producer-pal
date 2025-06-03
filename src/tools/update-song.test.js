// src/tools/update-song.test.js
import { describe, expect, it } from "vitest";
import { liveApiCall, liveApiId, liveApiSet } from "../mock-live-api";
import { updateSong } from "./update-song";

describe("updateSong", () => {
  beforeEach(() => {
    liveApiId.mockReturnValue("live_set_id");
  });

  it("should update tempo", () => {
    const result = updateSong({ tempo: 140 });
    expect(liveApiSet).toHaveBeenCalledWithThis(expect.objectContaining({ path: "live_set" }), "tempo", 140);
    expect(result).toEqual({
      id: "live_set_id",
      tempo: 140,
    });
  });

  it("should throw error for invalid tempo", () => {
    expect(() => updateSong({ tempo: 10 })).toThrow("Tempo must be between");
    expect(() => updateSong({ tempo: 1000 })).toThrow("Tempo must be between");
  });

  it("should update time signature", () => {
    const result = updateSong({ timeSignature: "3/4" });
    expect(liveApiSet).toHaveBeenCalledWithThis(expect.objectContaining({ path: "live_set" }), "signature_numerator", 3);
    expect(liveApiSet).toHaveBeenCalledWithThis(expect.objectContaining({ path: "live_set" }), "signature_denominator", 4);
    expect(result).toEqual({
      id: "live_set_id",
      timeSignature: "3/4",
    });
  });

  it("should throw error for invalid time signature format", () => {
    expect(() => updateSong({ timeSignature: "invalid" })).toThrow("Time signature must be in format");
    expect(() => updateSong({ timeSignature: "3-4" })).toThrow("Time signature must be in format");
  });

  it("should update multiple properties simultaneously", () => {
    const result = updateSong({
      tempo: 125,
      timeSignature: "6/8",
      view: "arrangement",
    });
    expect(liveApiSet).toHaveBeenCalledWithThis(expect.objectContaining({ path: "live_set" }), "tempo", 125);
    expect(liveApiSet).toHaveBeenCalledWithThis(expect.objectContaining({ path: "live_set" }), "signature_numerator", 6);
    expect(liveApiSet).toHaveBeenCalledWithThis(expect.objectContaining({ path: "live_set" }), "signature_denominator", 8);
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_app view" }),
      "show_view",
      "Arranger"
    );
    expect(result).toEqual({
      id: "live_set_id",
      tempo: 125,
      timeSignature: "6/8",
      view: "arrangement",
    });
  });

  it("should switch to Arrangement view when requested", () => {
    const result = updateSong({ view: "arrangement" });
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_app view" }),
      "show_view",
      "Arranger"
    );
    expect(result).toEqual({
      id: "live_set_id",
      view: "arrangement",
    });
  });

  it("should switch to Session view when requested", () => {
    const result = updateSong({ view: "session" });
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_app view" }),
      "show_view",
      "Session"
    );
    expect(result).toEqual({
      id: "live_set_id",
      view: "session",
    });
  });

  it("should return only song ID when no properties are updated", () => {
    const result = updateSong({});
    expect(liveApiSet).not.toHaveBeenCalled();
    expect(liveApiCall).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: "live_set_id",
    });
  });
});

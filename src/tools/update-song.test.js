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
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "tempo",
      140,
    );
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
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "signature_numerator",
      3,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "signature_denominator",
      4,
    );
    expect(result).toEqual({
      id: "live_set_id",
      timeSignature: "3/4",
    });
  });

  it("should throw error for invalid time signature format", () => {
    expect(() => updateSong({ timeSignature: "invalid" })).toThrow(
      "Time signature must be in format",
    );
    expect(() => updateSong({ timeSignature: "3-4" })).toThrow(
      "Time signature must be in format",
    );
  });

  it("should update multiple properties simultaneously", () => {
    const result = updateSong({
      tempo: 125,
      timeSignature: "6/8",
      view: "arrangement",
    });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "tempo",
      125,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "signature_numerator",
      6,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "signature_denominator",
      8,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_app view" }),
      "show_view",
      "Arranger",
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
      "Arranger",
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
      "Session",
    );
    expect(result).toEqual({
      id: "live_set_id",
      view: "session",
    });
  });

  it("should update root note", () => {
    const result = updateSong({ rootNote: 2 });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      2,
    );
    expect(result).toEqual({
      id: "live_set_id",
      rootNote: 2,
    });
  });

  it("should throw error for invalid root note", () => {
    expect(() => updateSong({ rootNote: -1 })).toThrow("Root note must be an integer between 0 and 11");
    expect(() => updateSong({ rootNote: 12 })).toThrow("Root note must be an integer between 0 and 11");
    expect(() => updateSong({ rootNote: 5.5 })).toThrow("Root note must be an integer between 0 and 11");
    expect(() => updateSong({ rootNote: "C" })).toThrow("Root note must be an integer between 0 and 11");
  });

  it("should update scale", () => {
    const result = updateSong({ scale: "Dorian" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Dorian",
    );
    expect(result).toEqual({
      id: "live_set_id",
      scale: "Dorian",
    });
  });

  it("should throw error for invalid scale name", () => {
    expect(() => updateSong({ scale: "invalid" })).toThrow("Scale name must be one of:");
    expect(() => updateSong({ scale: "major" })).toThrow("Scale name must be one of:");
    expect(() => updateSong({ scale: "MINOR" })).toThrow("Scale name must be one of:");
    expect(() => updateSong({ scale: "Major Foo" })).toThrow("Scale name must be one of:");
  });

  it("should enable scale highlighting", () => {
    const result = updateSong({ scaleEnabled: true });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_mode",
      1,
    );
    expect(result).toEqual({
      id: "live_set_id",
      scaleEnabled: true,
    });
  });

  it("should disable scale highlighting", () => {
    const result = updateSong({ scaleEnabled: false });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_mode",
      0,
    );
    expect(result).toEqual({
      id: "live_set_id",
      scaleEnabled: false,
    });
  });

  it("should update key with both root note and scale name", () => {
    const result = updateSong({ rootNote: 2, scale: "Dorian" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      2,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Dorian",
    );
    expect(result).toEqual({
      id: "live_set_id",
      rootNote: 2,
      scale: "Dorian",
    });
  });

  it("should update all properties simultaneously", () => {
    const result = updateSong({
      tempo: 125,
      timeSignature: "6/8",
      rootNote: 7,
      scale: "Mixolydian",
      scaleEnabled: true,
      view: "arrangement",
    });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "tempo",
      125,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "signature_numerator",
      6,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "signature_denominator",
      8,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      7,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Mixolydian",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_mode",
      1,
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_app view" }),
      "show_view",
      "Arranger",
    );
    expect(result).toEqual({
      id: "live_set_id",
      tempo: 125,
      timeSignature: "6/8",
      rootNote: 7,
      scale: "Mixolydian",
      scaleEnabled: true,
      view: "arrangement",
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

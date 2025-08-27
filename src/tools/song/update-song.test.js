// src/tools/song/update-song.test.js
import { beforeEach, describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
} from "../../test/mock-live-api";
import { updateSong } from "./update-song";

describe("updateSong", () => {
  let mockRootNote = 0; // Track the root note state across tests

  beforeEach(() => {
    liveApiId.mockReturnValue("live_set_id");
    mockRootNote = 0; // Reset to C for each test

    // Mock scale_intervals and root_note for tests that need it
    liveApiGet.mockImplementation(function (property) {
      if (property === "scale_intervals") {
        return [0, 2, 4, 5, 7, 9, 11]; // Major scale intervals
      }
      if (property === "root_note") {
        return [mockRootNote]; // Return array with the current mock root note
      }
      return this._id;
    });

    // Mock the set method to update our mock root note
    liveApiSet.mockImplementation(function (property, value) {
      if (property === "root_note") {
        mockRootNote = value;
      }
      // Return the id to keep the mock consistent
      return this._id;
    });
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
    expect(result).toEqual({
      id: "live_set_id",
      tempo: 125,
      timeSignature: "6/8",
    });
  });

  it("should update scale root", () => {
    const result = updateSong({ scaleRoot: "D" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      2,
    );
    expect(result).toEqual({
      id: "live_set_id",
      scaleRoot: "D",
      scalePitches: ["D", "E", "Gb", "G", "A", "B", "Db"],
    });
  });

  it("should throw error for invalid scale root", () => {
    expect(() => updateSong({ scaleRoot: "invalid" })).toThrow(
      "Invalid pitch class",
    );
    expect(() => updateSong({ scaleRoot: "H" })).toThrow("Invalid pitch class");
    expect(() => updateSong({ scaleRoot: "c" })).toThrow("Invalid pitch class");
    expect(() => updateSong({ scaleRoot: 123 })).toThrow("Invalid pitch class");
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
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
    });
  });

  it("should throw error for invalid scale name", () => {
    expect(() => updateSong({ scale: "invalid" })).toThrow(
      "Scale name must be one of:",
    );
    expect(() => updateSong({ scale: "major" })).toThrow(
      "Scale name must be one of:",
    );
    expect(() => updateSong({ scale: "MINOR" })).toThrow(
      "Scale name must be one of:",
    );
    expect(() => updateSong({ scale: "Major Foo" })).toThrow(
      "Scale name must be one of:",
    );
  });

  it("should enable the song scaleEnabled property", () => {
    const result = updateSong({ scaleEnabled: true });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_mode",
      1,
    );
    expect(result).toEqual({
      id: "live_set_id",
      scaleEnabled: true,
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
    });
  });

  it("should disable the song scaleEnabled property", () => {
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

  it("should update key with both scale root and scale name", () => {
    const result = updateSong({ scaleRoot: "D", scale: "Dorian" });
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
      scaleRoot: "D",
      scale: "Dorian",
      scalePitches: ["D", "E", "Gb", "G", "A", "B", "Db"],
    });
  });

  it("should update all properties simultaneously", () => {
    const result = updateSong({
      tempo: 125,
      timeSignature: "6/8",
      scaleRoot: "G",
      scale: "Mixolydian",
      scaleEnabled: true,
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
    expect(result).toEqual({
      id: "live_set_id",
      tempo: 125,
      timeSignature: "6/8",
      scaleRoot: "G",
      scale: "Mixolydian",
      scaleEnabled: true,
      scalePitches: ["G", "A", "B", "C", "D", "E", "Gb"],
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

  it("should return scalePitches when scale is set", () => {
    const result = updateSong({ scale: "Major" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Major",
    );
    expect(liveApiGet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_intervals",
    );
    expect(result).toEqual({
      id: "live_set_id",
      scale: "Major",
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
    });
  });

  it("should return scalePitches when scaleRoot is set", () => {
    const result = updateSong({ scaleRoot: "D" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      2,
    );
    expect(liveApiGet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_intervals",
    );
    expect(result).toEqual({
      id: "live_set_id",
      scaleRoot: "D",
      scalePitches: ["D", "E", "Gb", "G", "A", "B", "Db"],
    });
  });

  it("should return scalePitches when scaleEnabled is set to true", () => {
    const result = updateSong({ scaleEnabled: true });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_mode",
      1,
    );
    expect(liveApiGet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_intervals",
    );
    expect(result).toEqual({
      id: "live_set_id",
      scaleEnabled: true,
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
    });
  });

  it("should NOT return scalePitches when scaleEnabled is set to false", () => {
    const result = updateSong({ scaleEnabled: false });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_mode",
      0,
    );
    expect(liveApiGet).not.toHaveBeenCalledWith("scale_intervals");
    expect(result).toEqual({
      id: "live_set_id",
      scaleEnabled: false,
    });
  });

  it("should return scalePitches when both scale and scaleRoot are set", () => {
    const result = updateSong({ scale: "Minor", scaleRoot: "A" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Minor",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      9,
    );
    expect(liveApiGet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_intervals",
    );
    expect(result).toEqual({
      id: "live_set_id",
      scale: "Minor",
      scaleRoot: "A",
      scalePitches: ["A", "B", "Db", "D", "E", "Gb", "Ab"],
    });
  });

  it("should NOT return scalePitches when no scale-related parameters are set", () => {
    const result = updateSong({ tempo: 140 });
    expect(liveApiGet).not.toHaveBeenCalledWith("scale_intervals");
    expect(result).toEqual({
      id: "live_set_id",
      tempo: 140,
    });
  });

  it("should NOT return scalePitches when scaleEnabled is false, even with other scale params", () => {
    const result = updateSong({
      scale: "Minor",
      scaleRoot: "F",
      scaleEnabled: false,
    });
    expect(liveApiGet).not.toHaveBeenCalledWith("scale_intervals");
    expect(result).toEqual({
      id: "live_set_id",
      scale: "Minor",
      scaleRoot: "F",
      scaleEnabled: false,
    });
  });
});

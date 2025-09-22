import { beforeEach, describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
} from "../../test/mock-live-api";
import { updateSong } from "./update-song";

const scaleChangeNote =
  "Scale applied to selected clips and defaults for new clips.";

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

  it("should update scale with combined scaleRoot + scaleName format", () => {
    const result = updateSong({ scale: "D Major" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      2,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Major",
    );
    expect(result).toEqual({
      id: "live_set_id",
      scale: "D Major",
      scalePitches: ["D", "E", "Gb", "G", "A", "B", "Db"],
      $meta: [scaleChangeNote],
    });
  });

  it("should throw error for invalid scale format", () => {
    expect(() => updateSong({ scale: "invalid" })).toThrow(
      "Scale must be in format",
    );
    expect(() => updateSong({ scale: "H Major" })).toThrow(
      "Invalid scale root",
    );
    expect(() => updateSong({ scale: "C Foo" })).toThrow("Invalid scale name");
    expect(() => updateSong({ scale: "Major" })).toThrow(
      "Scale must be in format",
    );
  });

  it("should update scale with different root note", () => {
    const result = updateSong({ scale: "C Dorian" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Dorian",
    );
    expect(result).toEqual({
      id: "live_set_id",
      scale: "C Dorian",
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
      $meta: [scaleChangeNote],
    });
  });

  it("should handle sharp and flat scale roots", () => {
    const result1 = updateSong({ scale: "F# Minor" });
    expect(result1.scale).toBe("F# Minor");

    const result2 = updateSong({ scale: "Bb Major" });
    expect(result2.scale).toBe("Bb Major");
  });

  it("should handle case insensitive scale input and normalize the output", () => {
    const result1 = updateSong({ scale: "c major" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Major",
    );
    expect(result1.scale).toBe("C Major");

    const result2 = updateSong({ scale: "D# MINOR" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      3,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Minor",
    );
    expect(result2.scale).toBe("D# Minor");

    const result3 = updateSong({ scale: "bB DoRiAn" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      10,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Dorian",
    );
    expect(result3.scale).toBe("Bb Dorian");
  });

  it("should handle various whitespace formats in scale input and normalize the scale name in the output", () => {
    // Test with tab
    const result1 = updateSong({ scale: "C\tMajor" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      0,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Major",
    );
    expect(result1.scale).toBe("C Major");

    // Test with multiple spaces
    const result2 = updateSong({ scale: "D   Minor" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      2,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Minor",
    );
    expect(result2.scale).toBe("D Minor");

    // Test with mixed whitespace
    const result3 = updateSong({ scale: "F# \t Dorian" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      6,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Dorian",
    );
    expect(result3.scale).toBe("F# Dorian");
  });

  it("should disable scale when given empty string", () => {
    const result = updateSong({ scale: "" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_mode",
      0,
    );
    expect(result).toEqual({
      id: "live_set_id",
      scale: "",
      $meta: [scaleChangeNote],
    });
  });

  it("should update complex scale names", () => {
    const result = updateSong({ scale: "D Dorian" });
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
      scale: "D Dorian",
      scalePitches: ["D", "E", "Gb", "G", "A", "B", "Db"],
      $meta: [scaleChangeNote],
    });
  });

  it("should update all properties simultaneously", () => {
    const result = updateSong({
      tempo: 125,
      timeSignature: "6/8",
      scale: "G Mixolydian",
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
      scale: "G Mixolydian",
      scalePitches: ["G", "A", "B", "C", "D", "E", "Gb"],
      $meta: [scaleChangeNote],
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
    const result = updateSong({ scale: "C Major" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      0,
    );
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
      scale: "C Major",
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
      $meta: [scaleChangeNote],
    });
  });

  it("should parse scale correctly for different roots", () => {
    const result = updateSong({ scale: "D Major" });
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
      scale: "D Major",
      scalePitches: ["D", "E", "Gb", "G", "A", "B", "Db"],
      $meta: [scaleChangeNote],
    });
  });

  it("should handle minor scales correctly", () => {
    const result = updateSong({ scale: "A Minor" });
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
      scale: "A Minor",
      scalePitches: ["A", "B", "Db", "D", "E", "Gb", "Ab"],
      $meta: [scaleChangeNote],
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

  it("should NOT return scalePitches when scale is disabled with empty string", () => {
    const result = updateSong({ scale: "" });
    expect(liveApiGet).not.toHaveBeenCalledWith("scale_intervals");
    expect(result).toEqual({
      id: "live_set_id",
      scale: "",
      $meta: [scaleChangeNote],
    });
  });
});

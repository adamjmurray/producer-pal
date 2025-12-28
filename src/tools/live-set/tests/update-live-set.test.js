import { beforeEach, describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
} from "#src/test/mock-live-api.js";
import { updateLiveSet } from "../update-live-set.js";

const scaleChangeNote =
  "Scale applied to selected clips and defaults for new clips.";

describe("updateLiveSet", () => {
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

  it("should update tempo", async () => {
    const result = await updateLiveSet({ tempo: 140 });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "tempo",
      140,
    );
    expect(result).toStrictEqual({
      id: "live_set_id",
      tempo: 140,
    });
  });

  it("should throw error for invalid tempo", async () => {
    await expect(updateLiveSet({ tempo: 10 })).rejects.toThrow(
      "Tempo must be between",
    );
    await expect(updateLiveSet({ tempo: 1000 })).rejects.toThrow(
      "Tempo must be between",
    );
  });

  it("should update time signature", async () => {
    const result = await updateLiveSet({ timeSignature: "3/4" });

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
    expect(result).toStrictEqual({
      id: "live_set_id",
      timeSignature: "3/4",
    });
  });

  it("should throw error for invalid time signature format", async () => {
    await expect(updateLiveSet({ timeSignature: "invalid" })).rejects.toThrow(
      "Time signature must be in format",
    );
    await expect(updateLiveSet({ timeSignature: "3-4" })).rejects.toThrow(
      "Time signature must be in format",
    );
  });

  it("should update multiple properties simultaneously", async () => {
    const result = await updateLiveSet({
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
    expect(result).toStrictEqual({
      id: "live_set_id",
      tempo: 125,
      timeSignature: "6/8",
    });
  });

  it("should update scale with combined scaleRoot + scaleName format", async () => {
    const result = await updateLiveSet({ scale: "D Major" });

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
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "D Major",
      scalePitches: ["D", "E", "Gb", "G", "A", "B", "Db"],
      $meta: [scaleChangeNote],
    });
  });

  it("should throw error for invalid scale format", async () => {
    await expect(updateLiveSet({ scale: "invalid" })).rejects.toThrow(
      "Scale must be in format",
    );
    await expect(updateLiveSet({ scale: "H Major" })).rejects.toThrow(
      "Invalid scale root",
    );
    await expect(updateLiveSet({ scale: "C Foo" })).rejects.toThrow(
      "Invalid scale name",
    );
    await expect(updateLiveSet({ scale: "Major" })).rejects.toThrow(
      "Scale must be in format",
    );
  });

  it("should update scale with different root note", async () => {
    const result = await updateLiveSet({ scale: "C Dorian" });

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
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "C Dorian",
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
      $meta: [scaleChangeNote],
    });
  });

  it("should handle sharp and flat scale roots", async () => {
    const result1 = await updateLiveSet({ scale: "F# Minor" });

    expect(result1.scale).toBe("F# Minor");

    const result2 = await updateLiveSet({ scale: "Bb Major" });

    expect(result2.scale).toBe("Bb Major");
  });

  it("should handle case insensitive scale input and normalize the output", async () => {
    const result1 = await updateLiveSet({ scale: "c major" });

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

    const result2 = await updateLiveSet({ scale: "D# MINOR" });

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

    const result3 = await updateLiveSet({ scale: "bB DoRiAn" });

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

  it("should handle various whitespace formats in scale input and normalize the scale name in the output", async () => {
    // Test with tab
    const result1 = await updateLiveSet({ scale: "C\tMajor" });

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
    const result2 = await updateLiveSet({ scale: "D   Minor" });

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
    const result3 = await updateLiveSet({ scale: "F# \t Dorian" });

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

  it("should disable scale when given empty string", async () => {
    const result = await updateLiveSet({ scale: "" });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_mode",
      0,
    );
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "",
      $meta: [scaleChangeNote],
    });
  });

  it("should update complex scale names", async () => {
    const result = await updateLiveSet({ scale: "D Dorian" });

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
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "D Dorian",
      scalePitches: ["D", "E", "Gb", "G", "A", "B", "Db"],
      $meta: [scaleChangeNote],
    });
  });

  it("should update all properties simultaneously", async () => {
    const result = await updateLiveSet({
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
    expect(result).toStrictEqual({
      id: "live_set_id",
      tempo: 125,
      timeSignature: "6/8",
      scale: "G Mixolydian",
      scalePitches: ["G", "A", "B", "C", "D", "E", "Gb"],
      $meta: [scaleChangeNote],
    });
  });

  it("should return only song ID when no properties are updated", async () => {
    const result = await updateLiveSet({});

    expect(liveApiSet).not.toHaveBeenCalled();
    expect(liveApiCall).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      id: "live_set_id",
    });
  });

  it("should return scalePitches when scale is set", async () => {
    const result = await updateLiveSet({ scale: "C Major" });

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
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "C Major",
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
      $meta: [scaleChangeNote],
    });
  });

  it("should parse scale correctly for different roots", async () => {
    const result = await updateLiveSet({ scale: "D Major" });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      2,
    );
    expect(liveApiGet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_intervals",
    );
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "D Major",
      scalePitches: ["D", "E", "Gb", "G", "A", "B", "Db"],
      $meta: [scaleChangeNote],
    });
  });

  it("should handle minor scales correctly", async () => {
    const result = await updateLiveSet({ scale: "A Minor" });

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
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "A Minor",
      scalePitches: ["A", "B", "Db", "D", "E", "Gb", "Ab"],
      $meta: [scaleChangeNote],
    });
  });

  it("should NOT return scalePitches when no scale-related parameters are set", async () => {
    const result = await updateLiveSet({ tempo: 140 });

    expect(liveApiGet).not.toHaveBeenCalledWith("scale_intervals");
    expect(result).toStrictEqual({
      id: "live_set_id",
      tempo: 140,
    });
  });

  it("should NOT return scalePitches when scale is disabled with empty string", async () => {
    const result = await updateLiveSet({ scale: "" });

    expect(liveApiGet).not.toHaveBeenCalledWith("scale_intervals");
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "",
      $meta: [scaleChangeNote],
    });
  });

  it("should set arrangementFollower to true (all tracks follow arrangement) - hidden from interface but implementation remains", async () => {
    const result = await updateLiveSet({ arrangementFollower: true });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "back_to_arranger",
      0, // 0 = following arrangement
    );
    expect(result).toStrictEqual({
      id: "live_set_id",
      arrangementFollower: true,
    });
  });

  it("should set arrangementFollower to false (tracks don't follow arrangement) - hidden from interface but implementation remains", async () => {
    const result = await updateLiveSet({ arrangementFollower: false });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "back_to_arranger",
      1, // 1 = not following arrangement
    );
    expect(result).toStrictEqual({
      id: "live_set_id",
      arrangementFollower: false,
    });
  });

  it("should combine arrangementFollower with other parameters - hidden from interface but implementation remains", async () => {
    const result = await updateLiveSet({
      tempo: 130,
      arrangementFollower: true,
      timeSignature: "3/4",
    });

    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "tempo",
      130,
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "back_to_arranger",
      0,
    );
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
    expect(result).toStrictEqual({
      id: "live_set_id",
      tempo: 130,
      arrangementFollower: true,
      timeSignature: "3/4",
    });
  });
});

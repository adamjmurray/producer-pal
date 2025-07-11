// src/tools/update-song.test.js
import { beforeEach, describe, expect, it } from "vitest";
import {
  liveApiCall,
  liveApiGet,
  liveApiId,
  liveApiSet,
} from "../mock-live-api";
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
      scaleRoot: "G",
      scale: "Mixolydian",
      scaleEnabled: true,
      view: "arrangement",
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

  it("should deselect all clips when selectedClipId is null", () => {
    const result = updateSong({ scale: "Dorian", selectedClipId: null });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set view" }),
      "detail_clip",
      "id 0",
    );
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Dorian",
    );
    expect(result).toEqual({
      id: "live_set_id",
      scale: "Dorian",
      selectedClipId: null,
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
    });
  });

  it("should deselect clips when selectedClipId is null regardless of other properties", () => {
    const result = updateSong({ tempo: 120, selectedClipId: null });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set view" }),
      "detail_clip",
      "id 0",
    );
    expect(result).toEqual({
      id: "live_set_id",
      tempo: 120,
      selectedClipId: null,
    });
  });

  it("should select specific clip when selectedClipId is provided", () => {
    const result = updateSong({ selectedClipId: "123" });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set view" }),
      "detail_clip",
      "id 123",
    );
    expect(result).toEqual({
      id: "live_set_id",
      selectedClipId: "123",
    });
  });

  it("should not affect clip selection when selectedClipId is not provided", () => {
    const result = updateSong({ scale: "Minor" });
    expect(liveApiSet).not.toHaveBeenCalledWith("detail_clip", "id 0");
    expect(result).toEqual({
      id: "live_set_id",
      scale: "Minor",
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
    });
  });

  it("should perform clip selection before scale property changes", () => {
    const result = updateSong({
      selectedClipId: null,
      scaleRoot: "F#",
      scale: "Dorian",
      scaleEnabled: true,
    });

    // Verify clip deselection happens first, then scale properties
    expect(liveApiSet).toHaveBeenNthCalledWithThis(
      1,
      expect.objectContaining({ path: "live_set view" }),
      "detail_clip",
      "id 0",
    );
    expect(liveApiSet).toHaveBeenNthCalledWithThis(
      2,
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      6,
    );
    expect(liveApiSet).toHaveBeenNthCalledWithThis(
      3,
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Dorian",
    );
    expect(liveApiSet).toHaveBeenNthCalledWithThis(
      4,
      expect.objectContaining({ path: "live_set" }),
      "scale_mode",
      1,
    );

    expect(result).toEqual({
      id: "live_set_id",
      selectedClipId: null,
      scaleRoot: "F#",
      scale: "Dorian",
      scaleEnabled: true,
      scalePitches: ["Gb", "Ab", "Bb", "B", "Db", "Eb", "F"],
    });
  });

  it("should deselect clip and update all scale properties in correct order", () => {
    const result = updateSong({
      selectedClipId: null,
      scaleRoot: "Bb",
      scale: "Minor",
      scaleEnabled: false,
    });

    // Verify clip deselection happens first, then all scale properties in order
    expect(liveApiSet).toHaveBeenNthCalledWithThis(
      1,
      expect.objectContaining({ path: "live_set view" }),
      "detail_clip",
      "id 0",
    );
    expect(liveApiSet).toHaveBeenNthCalledWithThis(
      2,
      expect.objectContaining({ path: "live_set" }),
      "root_note",
      10,
    );
    expect(liveApiSet).toHaveBeenNthCalledWithThis(
      3,
      expect.objectContaining({ path: "live_set" }),
      "scale_name",
      "Minor",
    );
    expect(liveApiSet).toHaveBeenNthCalledWithThis(
      4,
      expect.objectContaining({ path: "live_set" }),
      "scale_mode",
      0,
    );

    expect(result).toEqual({
      id: "live_set_id",
      selectedClipId: null,
      scaleRoot: "Bb",
      scale: "Minor",
      scaleEnabled: false,
    });
  });

  it("should show clip detail view when showClip is true and clip is selected", () => {
    const result = updateSong({ selectedClipId: "123", showClip: true });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set view" }),
      "detail_clip",
      "id 123",
    );
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_app view" }),
      "focus_view",
      "Detail/Clip",
    );
    expect(result).toEqual({
      id: "live_set_id",
      selectedClipId: "123",
      showClip: true,
    });
  });

  it("should not show clip detail view when showClip is true but no clip is selected", () => {
    const result = updateSong({ showClip: true });
    expect(liveApiCall).not.toHaveBeenCalledWith("focus_view", "Detail/Clip");
    expect(result).toEqual({
      id: "live_set_id",
      showClip: true,
    });
  });

  it("should not show clip detail view when showClip is true but selectedClipId is null", () => {
    const result = updateSong({ selectedClipId: null, showClip: true });
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set view" }),
      "detail_clip",
      "id 0",
    );
    expect(liveApiCall).not.toHaveBeenCalledWith("focus_view", "Detail/Clip");
    expect(result).toEqual({
      id: "live_set_id",
      selectedClipId: null,
      showClip: true,
    });
  });

  it("should work with view switching and showClip together", () => {
    const result = updateSong({
      view: "session",
      selectedClipId: "456",
      showClip: true,
    });

    // Verify correct order: view switch, clip selection, then focus detail view
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      1,
      expect.objectContaining({ path: "live_app view" }),
      "show_view",
      "Session",
    );
    expect(liveApiSet).toHaveBeenNthCalledWithThis(
      1,
      expect.objectContaining({ path: "live_set view" }),
      "detail_clip",
      "id 456",
    );
    expect(liveApiCall).toHaveBeenNthCalledWithThis(
      2,
      expect.objectContaining({ path: "live_app view" }),
      "focus_view",
      "Detail/Clip",
    );
    expect(result).toEqual({
      id: "live_set_id",
      view: "session",
      selectedClipId: "456",
      showClip: true,
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

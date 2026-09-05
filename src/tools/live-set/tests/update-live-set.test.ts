// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateLiveSet } from "#src/tools/live-set/update-live-set.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const scaleChangeNote =
  "Scale applied to selected clips and defaults for new clips.";
const scaleDisabledNote =
  "Scale disabled for selected clips and defaults for new clips.";
const scaleRespellNote =
  "Scale roots are spelled with flats, so F# comes back as Gb — " +
  "same scale, set correctly.";

const D_MAJOR_RESULT = {
  id: "live_set_id",
  scale: "D Major",
  scalePitches: ["D", "E", "Gb", "G", "A", "B", "Db"],
  $meta: [scaleChangeNote],
};

describe("updateLiveSet", () => {
  let liveSet: RegisteredMockObject;
  // Track the scale state across tests. Live stores root_note as a pitch class
  // number with no spelling, so the mock must too — that's what makes the
  // write result render "Gb" for an "F#" request, like every read does.
  let mockRootNote = 0;
  let mockScaleName = "Major";

  beforeEach(() => {
    liveSet = registerMockObject("live_set_id", { path: livePath.liveSet });
    mockRootNote = 0; // Reset to C for each test
    mockScaleName = "Major";

    // Mock scale_intervals and root_note for tests that need it
    liveSet.get.mockImplementation(function (property: string) {
      if (property === "scale_intervals") {
        return [0, 2, 4, 5, 7, 9, 11]; // Major scale intervals
      }

      if (property === "root_note") {
        return [mockRootNote]; // Return array with the current mock root note
      }

      if (property === "scale_name") {
        return [mockScaleName];
      }

      return [0];
    });

    // Mock the set method to update our mock scale state
    liveSet.set.mockImplementation(function (property: string, value: unknown) {
      if (property === "root_note") {
        mockRootNote = value as number;
      }

      if (property === "scale_name") {
        mockScaleName = value as string;
      }
    });
  });

  /**
   * Set the scale and check the root note, the scale name, and the spelling
   * the result reports back.
   * @param input - The scale as the caller spelled it
   * @param rootNote - Pitch class Live should be given
   * @param scaleName - Scale name Live should be given
   * @param normalized - The scale the result should report
   */
  async function expectScaleNormalizes(
    input: string,
    rootNote: number,
    scaleName: string,
    normalized: string,
  ): Promise<void> {
    const result = await updateLiveSet({ scale: input });

    expect(liveSet.set).toHaveBeenCalledWith("root_note", rootNote);
    expect(liveSet.set).toHaveBeenCalledWith("scale_name", scaleName);
    expect(result.scale).toBe(normalized);
  }

  it("should update tempo", async () => {
    const result = await updateLiveSet({ tempo: 140 });

    expect(liveSet.set).toHaveBeenCalledWith("tempo", 140);
    expect(result).toStrictEqual({
      id: "live_set_id",
      tempo: 140,
    });
    // scale was not provided → applyScale must not run (it would warn on the
    // undefined scale via its parse-error path).
    expect(capturedWarnings()).toHaveLength(0);
  });

  it("throws for an unknown locator operation", async () => {
    await expect(
      updateLiveSet({ locatorOperation: "bogus" as never }),
    ).rejects.toThrow("Unknown locator operation: bogus");
  });

  // One value for the whole call, and Live can't hold it — refused before any
  // property is written, the way a malformed timeSignature already was.
  it.each([10, 1000])("refuses an out-of-range tempo of %i", async (tempo) => {
    await expect(updateLiveSet({ tempo })).rejects.toThrow(
      "tempo must be between 20.0 and 999.0 BPM",
    );
    expect(liveSet.set).not.toHaveBeenCalled();
  });

  it("should update time signature", async () => {
    const result = await updateLiveSet({ timeSignature: "3/4" });

    expect(liveSet.set).toHaveBeenCalledWith("signature_numerator", 3);
    expect(liveSet.set).toHaveBeenCalledWith("signature_denominator", 4);
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

  it("validates timeSignature before applying any property (fail-fast)", async () => {
    // A malformed timeSignature must throw before tempo (or anything else) is
    // written, so the call can't leave the Live Set in a partially-updated
    // state with an error.
    await expect(
      updateLiveSet({ tempo: 130, timeSignature: "5" }),
    ).rejects.toThrow("Time signature must be in format");

    expect(liveSet.set).not.toHaveBeenCalledWith("tempo", 130);
  });

  it("should update multiple properties simultaneously", async () => {
    const result = await updateLiveSet({
      tempo: 125,
      timeSignature: "6/8",
    });

    expect(liveSet.set).toHaveBeenCalledWith("tempo", 125);
    expect(liveSet.set).toHaveBeenCalledWith("signature_numerator", 6);
    expect(liveSet.set).toHaveBeenCalledWith("signature_denominator", 8);
    expect(result).toStrictEqual({
      id: "live_set_id",
      tempo: 125,
      timeSignature: "6/8",
    });
  });

  it("should update scale with combined scaleRoot + scaleName format", async () => {
    const result = await updateLiveSet({ scale: "D Major" });

    expect(liveSet.set).toHaveBeenCalledWith("root_note", 2);
    expect(liveSet.set).toHaveBeenCalledWith("scale_name", "Major");
    expect(result).toStrictEqual(D_MAJOR_RESULT);
  });

  it("should warn and skip an invalid scale without throwing", async () => {
    // Mirrors the update-tool contract: invalid scale is skipped, not thrown,
    // so other updates in the same call still apply and no scale meta/pitches
    // are reported.
    for (const scale of ["invalid", "H Major", "C Foo", "Major"]) {
      const result = await updateLiveSet({ scale });

      expect(result).toStrictEqual({ id: "live_set_id" });
      expect(liveSet.set).not.toHaveBeenCalledWith("scale_mode", 1);
    }
  });

  it("should apply tempo even when the scale in the same call is invalid", async () => {
    const result = await updateLiveSet({ tempo: 120, scale: "bad" });

    expect(liveSet.set).toHaveBeenCalledWith("tempo", 120);
    expect(result).toStrictEqual({ id: "live_set_id", tempo: 120 });
  });

  it("should update scale with different root note", async () => {
    const result = await updateLiveSet({ scale: "C Dorian" });

    expect(liveSet.set).toHaveBeenCalledWith("root_note", 0);
    expect(liveSet.set).toHaveBeenCalledWith("scale_name", "Dorian");
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "C Dorian",
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
      $meta: [scaleChangeNote],
    });
  });

  it("reports a sharp root by the flat name Live stores", async () => {
    // Live keeps root_note, a pitch class number with no spelling, so reads
    // always render it flat. The write result must agree with them.
    const sharp = await updateLiveSet({ scale: "F# Dorian" });

    expect(liveSet.set).toHaveBeenCalledWith("root_note", 6);
    expect(sharp.scale).toBe("Gb Dorian");

    const flat = await updateLiveSet({ scale: "Bb Major" });

    expect(flat.scale).toBe("Bb Major");

    // A root with no enharmonic spelling comes back unchanged.
    const natural = await updateLiveSet({ scale: "C Major" });

    expect(natural.scale).toBe("C Major");
  });

  it("explains the respelling only when the root comes back differently", async () => {
    // Weak models read a changed value as a failed write and retry, so the
    // respelled case has to say the write succeeded.
    const sharp = await updateLiveSet({ scale: "F# Dorian" });

    expect(sharp.$meta).toStrictEqual([scaleChangeNote, scaleRespellNote]);

    const flat = await updateLiveSet({ scale: "Db Major" });

    expect(flat.$meta).toStrictEqual([scaleChangeNote]);

    const natural = await updateLiveSet({ scale: "C Major" });

    expect(natural.$meta).toStrictEqual([scaleChangeNote]);

    const disabled = await updateLiveSet({ scale: "" });

    expect(disabled.$meta).toStrictEqual([scaleDisabledNote]);

    const invalid = await updateLiveSet({ scale: "H Major" });

    expect(invalid.$meta).toBeUndefined();
  });

  it("should handle case insensitive scale input and normalize the output", async () => {
    await expectScaleNormalizes("c major", 0, "Major", "C Major");
    await expectScaleNormalizes("D# MINOR", 3, "Minor", "Eb Minor");
    await expectScaleNormalizes("bB DoRiAn", 10, "Dorian", "Bb Dorian");
  });

  it("should handle various whitespace formats in scale input and normalize the scale name in the output", async () => {
    // Tab, multiple spaces, then a mix of both.
    await expectScaleNormalizes("C\tMajor", 0, "Major", "C Major");
    await expectScaleNormalizes("D   Minor", 2, "Minor", "D Minor");
    await expectScaleNormalizes("F# \t Dorian", 6, "Dorian", "Gb Dorian");
  });

  it("should disable scale when given empty string", async () => {
    const result = await updateLiveSet({ scale: "" });

    expect(liveSet.set).toHaveBeenCalledWith("scale_mode", 0);
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "",
      $meta: [scaleDisabledNote],
    });
  });

  it("uses a distinct note for scale-disable vs scale-apply", async () => {
    // Disabling the scale (scale: "") must not claim a scale was "applied" —
    // the note describes the actual operation so the LLM isn't misled.
    const disabled = await updateLiveSet({ scale: "" });

    expect(disabled.$meta).toStrictEqual([scaleDisabledNote]);

    const applied = await updateLiveSet({ scale: "C Major" });

    expect(applied.$meta).toStrictEqual([scaleChangeNote]);
  });

  it("should update complex scale names", async () => {
    const result = await updateLiveSet({ scale: "D Dorian" });

    expect(liveSet.set).toHaveBeenCalledWith("root_note", 2);
    expect(liveSet.set).toHaveBeenCalledWith("scale_name", "Dorian");
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

    expect(liveSet.set).toHaveBeenCalledWith("tempo", 125);
    expect(liveSet.set).toHaveBeenCalledWith("signature_numerator", 6);
    expect(liveSet.set).toHaveBeenCalledWith("signature_denominator", 8);
    expect(liveSet.set).toHaveBeenCalledWith("root_note", 7);
    expect(liveSet.set).toHaveBeenCalledWith("scale_name", "Mixolydian");
    expect(liveSet.set).toHaveBeenCalledWith("scale_mode", 1);
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

    expect(liveSet.set).not.toHaveBeenCalled();
    expect(liveSet.call).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      id: "live_set_id",
    });
  });

  it("should return scalePitches when scale is set", async () => {
    const result = await updateLiveSet({ scale: "C Major" });

    expect(liveSet.set).toHaveBeenCalledWith("root_note", 0);
    expect(liveSet.set).toHaveBeenCalledWith("scale_name", "Major");
    expect(liveSet.get).toHaveBeenCalledWith("scale_intervals");
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "C Major",
      scalePitches: ["C", "D", "E", "F", "G", "A", "B"],
      $meta: [scaleChangeNote],
    });
  });

  it("should parse scale correctly for different roots", async () => {
    const result = await updateLiveSet({ scale: "D Major" });

    expect(liveSet.set).toHaveBeenCalledWith("root_note", 2);
    expect(liveSet.get).toHaveBeenCalledWith("scale_intervals");
    expect(result).toStrictEqual(D_MAJOR_RESULT);
  });

  it("should handle minor scales correctly", async () => {
    const result = await updateLiveSet({ scale: "A Minor" });

    expect(liveSet.set).toHaveBeenCalledWith("scale_name", "Minor");
    expect(liveSet.set).toHaveBeenCalledWith("root_note", 9);
    expect(liveSet.get).toHaveBeenCalledWith("scale_intervals");
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "A Minor",
      scalePitches: ["A", "B", "Db", "D", "E", "Gb", "Ab"],
      $meta: [scaleChangeNote],
    });
  });

  it("should NOT return scalePitches when no scale-related parameters are set", async () => {
    const result = await updateLiveSet({ tempo: 140 });

    expect(liveSet.get).not.toHaveBeenCalledWith("scale_intervals");
    expect(result).toStrictEqual({
      id: "live_set_id",
      tempo: 140,
    });
  });

  it("should NOT return scalePitches when scale is disabled with empty string", async () => {
    const result = await updateLiveSet({ scale: "" });

    expect(liveSet.get).not.toHaveBeenCalledWith("scale_intervals");
    expect(result).toStrictEqual({
      id: "live_set_id",
      scale: "",
      $meta: [scaleDisabledNote],
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { parseScale, parseScaleRequests } from "../scale-parsing.ts";

vi.mock(import("#src/shared/pitch.ts"), async (importOriginal) => {
  const original = await importOriginal();

  return {
    ...original,
    pitchClassToNumber: vi.fn(original.pitchClassToNumber),
  };
});

import { pitchClassToNumber } from "#src/shared/pitch.ts";

describe("parseScale", () => {
  it("should parse valid scale string", () => {
    const result = parseScale("C Major");

    expect(result).toStrictEqual({
      scaleRoot: "C",
      scaleName: "Major",
      scaleRootNumber: 0,
    });
  });

  it("should handle case-insensitive root notes", () => {
    const result = parseScale("f# minor");

    expect(result).toStrictEqual({
      scaleRoot: "F#",
      scaleName: "Minor",
      scaleRootNumber: 6,
    });
  });

  it("should resolve an enharmonic root to its canonical spelling", () => {
    expect(parseScale("Cb Major")).toStrictEqual({
      scaleRoot: "B",
      scaleName: "Major",
      scaleRootNumber: 11,
    });
    expect(parseScale("e# minor")).toStrictEqual({
      scaleRoot: "F",
      scaleName: "Minor",
      scaleRootNumber: 5,
    });
  });

  it("should handle Bb (flat notation)", () => {
    const result = parseScale("Bb Dorian");

    expect(result).toStrictEqual({
      scaleRoot: "Bb",
      scaleName: "Dorian",
      scaleRootNumber: 10,
    });
  });

  it("should handle extra whitespace", () => {
    const result = parseScale("  D   Mixolydian  ");

    expect(result).toStrictEqual({
      scaleRoot: "D",
      scaleName: "Mixolydian",
      scaleRootNumber: 2,
    });
  });

  it("should throw for invalid format - single word", () => {
    expect(() => parseScale("CMajor")).toThrow(
      "Scale must be in format 'Root ScaleName'",
    );
  });

  it("should join a multi-word scale name with a space", () => {
    const result = parseScale("C Whole Tone");

    expect(result).toStrictEqual({
      scaleRoot: "C",
      scaleName: "Whole Tone",
      scaleRootNumber: 0,
    });
  });

  it("should throw for invalid root note, listing the valid roots", () => {
    expect(() => parseScale("X Major")).toThrow("Invalid scale root 'X'");
    expect(() => parseScale("X Major")).toThrow(/Valid roots: C, /);
  });

  it("should throw for invalid scale name, listing the valid scales", () => {
    expect(() => parseScale("C InvalidScale")).toThrow(
      "Invalid scale name 'InvalidScale'",
    );
    expect(() => parseScale("C InvalidScale")).toThrow(/Valid scales: Major, /);
  });

  it("refuses a root that canonicalizes but has no pitch class", () => {
    // Defensive: canonicalizeScaleRoot accepted the root, so the second
    // lookup can only disagree if the two ever drift apart.
    vi.mocked(pitchClassToNumber).mockReturnValueOnce(null);

    expect(() => parseScale("C Major")).toThrow("Invalid scale root 'C'");
  });
});

const C_MAJOR = {
  requested: "C Major",
  parsed: { scaleRoot: "C", scaleName: "Major", scaleRootNumber: 0 },
};

describe("parseScaleRequests", () => {
  it("asks nothing of any clip when the param isn't sent", () => {
    expect(parseScaleRequests(undefined, 2)).toStrictEqual([
      undefined,
      undefined,
    ]);
    expect(parseScaleRequests(null, 1)).toStrictEqual([undefined]);
  });

  it("gives every clip a lone scale", () => {
    expect(parseScaleRequests("C Major", 3)).toStrictEqual([
      C_MAJOR,
      C_MAJOR,
      C_MAJOR,
    ]);
  });

  it("pairs a list with the clips in order", () => {
    expect(parseScaleRequests("C Major, f# minor", 2)).toStrictEqual([
      C_MAJOR,
      {
        requested: "f# minor",
        parsed: { scaleRoot: "F#", scaleName: "Minor", scaleRootNumber: 6 },
      },
    ]);
  });

  it("reads a multi-word scale name", () => {
    expect(
      parseScaleRequests("D Whole Tone,E Minor Blues", 2).map(
        (request) => request?.parsed?.scaleName,
      ),
    ).toStrictEqual(["Whole Tone", "Minor Blues"]);
  });

  it("reads a blank as switching the scale off, for every clip", () => {
    expect(parseScaleRequests("", 2)).toStrictEqual([
      { requested: "", parsed: null },
      { requested: "", parsed: null },
    ]);
  });

  it("refuses a scale it can't read, in a list as well as alone", () => {
    expect(() => parseScaleRequests("C Nonsense", 1)).toThrow(
      "Invalid scale name 'Nonsense'",
    );
    expect(() => parseScaleRequests("C Major,Q Minor", 2)).toThrow(
      "Invalid scale root 'Q'",
    );
  });

  it("refuses a blank entry inside a list", () => {
    expect(() => parseScaleRequests("C Major,,D Minor", 3)).toThrow(
      "invalid scale",
    );
  });
});

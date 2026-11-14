// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { interpretNotation, parseNotation } from "#src/notation/notation.ts";
import { type NoteEvent } from "#src/notation/types.ts";

const LIMIT_ERROR = /is over the limit of 10000/;

function bar1Notes(count: number): NoteEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    pitch: 60,
    start_time: (i * 4) / count,
    duration: 0.001,
    velocity: 100,
  }));
}

describe("notation limit", () => {
  describe("bar|beat", () => {
    it("allows a repeat at the limit", () => {
      expect(interpretNotation("C3 1|1x10000@n/16")).toHaveLength(10000);
    });

    it.each([
      ["C3 1|1x10001", "Repeat x10001"],
      ["C3 1|1x1000000", "Repeat x1000000"],
      ["C3 1|1 @2-1000000=1", "Bar range 2-1000000"],
      ["C3 1|1 @10002=1-10001", "Bar range 1-10001"],
    ])("refuses %s while parsing", (input, subject) => {
      expect(() => parseNotation(input)).toThrow(
        `${subject} is over the limit of 10000`,
      );
    });

    it("refuses a string that makes too many notes", () => {
      expect(() => interpretNotation("C3 D3 1|1x6000@n/16")).toThrow(
        "Note count is over the limit of 10000",
      );
    });

    it("refuses bar copies that make too many notes", () => {
      expect(() =>
        interpretNotation("@2-3=1", { existingNotes: bar1Notes(6000) }),
      ).toThrow(LIMIT_ERROR);
    });

    it("doesn't count the clip's existing notes", () => {
      const result = interpretNotation("C3 2|1", {
        existingNotes: bar1Notes(10000),
      });

      expect(result).toHaveLength(10001);
    });
  });

  describe("stark", () => {
    const stark = { notation: "stark" } as const;

    it("allows a repeat at the limit", () => {
      expect(interpretNotation("melody: C/16*10000", stark)).toHaveLength(
        10000,
      );
    });

    it.each([
      ["melody: C*10001", "Repeat *10001"],
      ["melody: C*1000000000", "Repeat *1000000000"],
      ["melody: z*1000000000 C", "Repeat *1000000000"],
    ])("refuses %s while parsing", (input, subject) => {
      expect(() => parseNotation(input, stark)).toThrow(
        `${subject} is over the limit of 10000`,
      );
    });

    it("refuses a string that makes too many notes", () => {
      expect(() => interpretNotation("melody: [C E]/16*6000", stark)).toThrow(
        "Note count is over the limit of 10000",
      );
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  fromLiveApiView,
  liveVersionAtLeast,
  parseTimeSignature,
  toLiveApiView,
} from "#src/tools/shared/helpers/live-api-values.ts";

describe("toLiveApiView", () => {
  it("converts lowercase view names to Live API format", () => {
    expect(toLiveApiView("session")).toBe("Session");
    expect(toLiveApiView("arrangement")).toBe("Arranger");
  });

  it("handles mixed case input", () => {
    expect(toLiveApiView("Session")).toBe("Session");
    expect(toLiveApiView("ARRANGEMENT")).toBe("Arranger");
    expect(toLiveApiView("ArRaNgEmEnT")).toBe("Arranger");
  });

  it("throws error for unknown view names", () => {
    expect(() => toLiveApiView("unknown")).toThrow("Unknown view: unknown");
    expect(() => toLiveApiView("")).toThrow("Unknown view: ");
    expect(() => toLiveApiView("arranger")).toThrow("Unknown view: arranger"); // We don't accept "arranger"
  });
});

describe("fromLiveApiView", () => {
  it("converts Live API view names to user-facing view names", () => {
    expect(fromLiveApiView("Session")).toBe("session");
    expect(fromLiveApiView("Arranger")).toBe("arrangement");
  });

  it("throws error for unknown Live API view names", () => {
    expect(() => fromLiveApiView("Unknown")).toThrow(
      "Unknown Live API view: Unknown",
    );
    expect(() => fromLiveApiView("")).toThrow("Unknown Live API view: ");
    expect(() => fromLiveApiView("session")).toThrow(
      "Unknown Live API view: session",
    ); // Should be "Session"
    expect(() => fromLiveApiView("arrangement")).toThrow(
      "Unknown Live API view: arrangement",
    ); // Should be "Arranger"
  });
});

describe("parseTimeSignature", () => {
  it("parses common time signatures", () => {
    expect(parseTimeSignature("4/4")).toStrictEqual({
      numerator: 4,
      denominator: 4,
    });
    expect(parseTimeSignature("3/4")).toStrictEqual({
      numerator: 3,
      denominator: 4,
    });
    expect(parseTimeSignature("2/4")).toStrictEqual({
      numerator: 2,
      denominator: 4,
    });
    expect(parseTimeSignature("6/8")).toStrictEqual({
      numerator: 6,
      denominator: 8,
    });
  });

  it("parses complex time signatures", () => {
    expect(parseTimeSignature("7/8")).toStrictEqual({
      numerator: 7,
      denominator: 8,
    });
    expect(parseTimeSignature("5/4")).toStrictEqual({
      numerator: 5,
      denominator: 4,
    });
    expect(parseTimeSignature("9/8")).toStrictEqual({
      numerator: 9,
      denominator: 8,
    });
    expect(parseTimeSignature("12/8")).toStrictEqual({
      numerator: 12,
      denominator: 8,
    });
  });

  it("parses unusual time signatures", () => {
    expect(parseTimeSignature("15/16")).toStrictEqual({
      numerator: 15,
      denominator: 16,
    });
    expect(parseTimeSignature("1/1")).toStrictEqual({
      numerator: 1,
      denominator: 1,
    });
    expect(parseTimeSignature("11/4")).toStrictEqual({
      numerator: 11,
      denominator: 4,
    });
  });

  it("handles large numbers", () => {
    expect(parseTimeSignature("128/64")).toStrictEqual({
      numerator: 128,
      denominator: 64,
    });
  });

  it("throws error for invalid format - missing slash", () => {
    expect(() => parseTimeSignature("44")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
  });

  it("throws error for invalid format - multiple slashes", () => {
    expect(() => parseTimeSignature("4/4/4")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
  });

  it("throws error for invalid format - non-numeric numerator", () => {
    expect(() => parseTimeSignature("four/4")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
  });

  it("throws error for invalid format - non-numeric denominator", () => {
    expect(() => parseTimeSignature("4/four")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
  });

  it("throws error for invalid format - empty numerator", () => {
    expect(() => parseTimeSignature("/4")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
  });

  it("throws error for invalid format - empty denominator", () => {
    expect(() => parseTimeSignature("4/")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
  });

  it("throws error for invalid format - spaces", () => {
    expect(() => parseTimeSignature("4 / 4")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
    expect(() => parseTimeSignature(" 4/4 ")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
  });

  it("throws error for invalid format - decimal numbers", () => {
    expect(() => parseTimeSignature("4.5/4")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
    expect(() => parseTimeSignature("4/4.5")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
  });

  it("throws error for invalid format - negative numbers", () => {
    expect(() => parseTimeSignature("-4/4")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
    expect(() => parseTimeSignature("4/-4")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
  });

  it("throws error for a zero numerator or denominator", () => {
    // "4/0" matches the format regex but a zero denominator is NaN/div-by-zero
    // downstream; "0/4" is meaningless. Both must be rejected as positive.
    expect(() => parseTimeSignature("4/0")).toThrow(
      "numerator and denominator must be positive",
    );
    expect(() => parseTimeSignature("0/4")).toThrow(
      "numerator and denominator must be positive",
    );
    expect(() => parseTimeSignature("0/0")).toThrow(
      "numerator and denominator must be positive",
    );
  });

  it("throws error for empty string", () => {
    expect(() => parseTimeSignature("")).toThrow(
      'Time signature must be in format "n/m" (e.g. "4/4")',
    );
  });
});

describe("liveVersionAtLeast", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  function liveIs(version: string): void {
    registerMockObject("live_app", {
      path: "live_app",
      methods: { get_version_string: () => version },
    });
  }

  it("lets a beta of the minimum count by default", () => {
    liveIs("12.4b3");

    expect(liveVersionAtLeast("12.4")).toBe(true);
    expect(liveVersionAtLeast("12.4.15")).toBe(false);
  });

  it.each([
    ["12.4.14", false],
    ["12.4", false],
    ["12.4.15b1", false],
    ["12.4.15", true],
    ["12.4.16b1", true],
    ["13.0b", true],
  ])("with release: true, Live %s is at least 12.4.15: %s", (v, expected) => {
    liveIs(v);

    expect(liveVersionAtLeast("12.4.15", { release: true })).toBe(expected);
  });
});

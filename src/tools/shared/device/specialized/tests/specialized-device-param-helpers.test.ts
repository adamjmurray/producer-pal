// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import "#src/live-api-adapter/live-api-extensions.ts";

import { describe, expect, it } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  coerceBool,
  coerceInt,
  readBoolProp,
  readEnumByIndex,
  writeBoolProp,
  writeEnumByIndex,
  writeIntFromSet,
  writeIntInRange,
} from "../specialized-device-param-helpers.ts";

const LABELS = ["alpha", "beta", "gamma"] as const;

/**
 * Register a mock device with the given properties and return its LiveAPI.
 * @param properties - Property overrides
 * @returns The registered mock object
 */
function registerDevice(properties: Record<string, unknown> = {}) {
  return registerMockObject("dev-1", {
    type: "Device",
    properties,
  });
}

describe("readEnumByIndex", () => {
  it("maps the stored index to its label", () => {
    registerDevice({ mode_index: 1 });

    expect(
      readEnumByIndex(LiveAPI.from("id dev-1"), "mode_index", LABELS),
    ).toBe("beta");
  });

  it("returns undefined for an out-of-range index", () => {
    registerDevice({ mode_index: 9 });

    expect(
      readEnumByIndex(LiveAPI.from("id dev-1"), "mode_index", LABELS),
    ).toBeUndefined();
  });
});

describe("writeEnumByIndex", () => {
  it("maps a label to its index and sets it", () => {
    const device = registerDevice({ mode_index: 0 });

    writeEnumByIndex(
      LiveAPI.from("id dev-1"),
      "mode_index",
      "gamma",
      LABELS,
      "updateDevice",
      "mode",
    );

    expect(device.set).toHaveBeenCalledWith("mode_index", 2);
  });

  it("matches labels case-insensitively and trims whitespace", () => {
    const device = registerDevice({ mode_index: 0 });

    writeEnumByIndex(
      LiveAPI.from("id dev-1"),
      "mode_index",
      "  GaMmA ",
      LABELS,
      "updateDevice",
      "mode",
    );

    expect(device.set).toHaveBeenCalledWith("mode_index", 2);
  });

  it("warns and skips an unknown label", () => {
    const device = registerDevice({ mode_index: 0 });

    writeEnumByIndex(
      LiveAPI.from("id dev-1"),
      "mode_index",
      "delta",
      LABELS,
      "updateDevice",
      "mode",
    );

    expect(device.set).not.toHaveBeenCalled();
    // The warning must list the valid labels, comma-separated — it is the only
    // place the model learns what it should have passed.
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        '"delta" is not a valid mode. Options: alpha, beta, gamma',
      ),
    );
  });
});

describe("readBoolProp", () => {
  it("returns true for a positive value", () => {
    registerDevice({ flag: 1 });

    expect(readBoolProp(LiveAPI.from("id dev-1"), "flag")).toBe(true);
  });

  it("returns false for zero", () => {
    registerDevice({ flag: 0 });

    expect(readBoolProp(LiveAPI.from("id dev-1"), "flag")).toBe(false);
  });
});

describe("coerceBool", () => {
  it.each([
    ["true", true],
    ["on", true],
    ["yes", true],
    ["1", true],
    ["FALSE", false],
    ["off", false],
    ["no", false],
    ["0", false],
  ] as const)("coerces string %s", (input, expected) => {
    expect(coerceBool(input)).toBe(expected);
  });

  it("treats nonzero numbers as true and zero as false", () => {
    expect(coerceBool(5)).toBe(true);
    expect(coerceBool(0)).toBe(false);
  });

  it("returns null for uninterpretable strings", () => {
    expect(coerceBool("maybe")).toBeNull();
  });

  it("trims surrounding whitespace before matching", () => {
    expect(coerceBool("  true  ")).toBe(true);
    expect(coerceBool("\toff\n")).toBe(false);
  });
});

describe("writeBoolProp", () => {
  it("writes 1 for a truthy value", () => {
    const device = registerDevice({ flag: 0 });

    writeBoolProp(
      LiveAPI.from("id dev-1"),
      "flag",
      "true",
      "updateDevice",
      "f",
    );

    expect(device.set).toHaveBeenCalledWith("flag", 1);
  });

  it("writes 0 for a falsy value", () => {
    const device = registerDevice({ flag: 1 });

    writeBoolProp(LiveAPI.from("id dev-1"), "flag", 0, "updateDevice", "f");

    expect(device.set).toHaveBeenCalledWith("flag", 0);
  });

  it("warns and skips uninterpretable input", () => {
    const device = registerDevice({ flag: 0 });

    writeBoolProp(
      LiveAPI.from("id dev-1"),
      "flag",
      "nope",
      "updateDevice",
      "f",
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(1, expect.stringContaining("valid f"));
  });
});

describe("coerceInt", () => {
  it("returns the integer for whole numbers and numeric strings", () => {
    expect(coerceInt(4)).toBe(4);
    expect(coerceInt("8")).toBe(8);
  });

  it("returns null for non-integers", () => {
    expect(coerceInt(4.5)).toBeNull();
    expect(coerceInt("abc")).toBeNull();
  });
});

describe("writeIntInRange", () => {
  it("writes a value inside the range", () => {
    const device = registerDevice({ count: 1 });

    writeIntInRange(
      LiveAPI.from("id dev-1"),
      "count",
      3,
      1,
      6,
      "updateDevice",
      "count",
    );

    expect(device.set).toHaveBeenCalledWith("count", 3);
  });

  it("warns and skips a value outside the range", () => {
    const device = registerDevice({ count: 1 });

    writeIntInRange(
      LiveAPI.from("id dev-1"),
      "count",
      9,
      1,
      6,
      "updateDevice",
      "count",
    );

    expect(device.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("count must be an integer 1-6"),
    );
  });

  it("warns and skips a non-integer", () => {
    const device = registerDevice({ count: 1 });

    writeIntInRange(
      LiveAPI.from("id dev-1"),
      "count",
      2.5,
      1,
      6,
      "updateDevice",
      "count",
    );

    expect(device.set).not.toHaveBeenCalled();
  });
});

describe("writeIntFromSet", () => {
  const ALLOWED = [4, 8, 16, 24, 32] as const;

  it("writes the value when it is in the set", () => {
    const device = registerDevice({ voices: 4 });

    writeIntFromSet(
      LiveAPI.from("id dev-1"),
      "voices",
      16,
      ALLOWED,
      "updateDevice",
      "voices",
    );

    expect(device.set).toHaveBeenCalledWith("voices", 16);
  });

  it("writes the catalog index when asIndex is true", () => {
    const device = registerDevice({ voice_count_index: 0 });

    writeIntFromSet(
      LiveAPI.from("id dev-1"),
      "voice_count_index",
      16,
      ALLOWED,
      "updateDevice",
      "voiceCount",
      true,
    );

    expect(device.set).toHaveBeenCalledWith("voice_count_index", 2);
  });

  it("warns and skips a value not in the set", () => {
    const device = registerDevice({ voices: 4 });

    writeIntFromSet(
      LiveAPI.from("id dev-1"),
      "voices",
      5,
      ALLOWED,
      "updateDevice",
      "voices",
    );

    expect(device.set).not.toHaveBeenCalled();
    // The warning must enumerate the allowed values, comma-separated.
    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining(
        `voices must be one of ${ALLOWED.join(", ")} (got "5")`,
      ),
    );
  });
});

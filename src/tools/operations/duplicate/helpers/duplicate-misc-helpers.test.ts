// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  switchViewIfRequested,
  parseCommaSeparatedNames,
  getNameForIndex,
} from "./duplicate-misc-helpers.ts";

// Mock the select module to avoid Live API dependencies
vi.mock(import("#src/tools/control/select.ts"), () => ({
  select: vi.fn(),
}));

describe("duplicate-misc-helpers", () => {
  describe("switchViewIfRequested", () => {
    let selectMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      vi.clearAllMocks();
      const selectModule = await import("#src/tools/control/select.ts");

      selectMock = selectModule.select as ReturnType<typeof vi.fn>;
    });

    it("does nothing when switchView is false", () => {
      switchViewIfRequested(false, "arrangement", "clip");

      expect(selectMock).not.toHaveBeenCalled();
    });

    it("does nothing when switchView is undefined", () => {
      switchViewIfRequested(undefined, "arrangement", "clip");

      expect(selectMock).not.toHaveBeenCalled();
    });

    it("does nothing when destination does not match a view and type is clip", () => {
      // Tests the code path where determineTargetView returns null
      // destination is not "arrangement" or "session", and type is not "track" or "scene"
      switchViewIfRequested(true, "some-other-destination", "clip");

      expect(selectMock).not.toHaveBeenCalled();
    });

    it("does nothing when destination is undefined and type is device", () => {
      // Another path where determineTargetView returns null
      switchViewIfRequested(true, undefined, "device");

      expect(selectMock).not.toHaveBeenCalled();
    });

    it("calls select with arrangement view when destination is arrangement", () => {
      switchViewIfRequested(true, "arrangement", "clip");

      expect(selectMock).toHaveBeenCalledWith({ view: "arrangement" });
    });

    it("calls select with session view when destination is session", () => {
      switchViewIfRequested(true, "session", "clip");

      expect(selectMock).toHaveBeenCalledWith({ view: "session" });
    });

    it("does nothing when type is track", () => {
      switchViewIfRequested(true, undefined, "track");

      expect(selectMock).not.toHaveBeenCalled();
    });

    it("calls select with session view when type is scene", () => {
      switchViewIfRequested(true, undefined, "scene");

      expect(selectMock).toHaveBeenCalledWith({ view: "session" });
    });
  });

  describe("parseCommaSeparatedNames", () => {
    it("returns null when count is 1", () => {
      expect(parseCommaSeparatedNames("Verse,Chorus", 1)).toBeNull();
    });

    it("returns null when name has no commas", () => {
      expect(parseCommaSeparatedNames("Lead", 3)).toBeNull();
    });

    it("returns null when name is undefined", () => {
      expect(parseCommaSeparatedNames(undefined, 3)).toBeNull();
    });

    it("splits comma-separated names when count > 1", () => {
      expect(parseCommaSeparatedNames("Lead,Pad", 2)).toStrictEqual([
        "Lead",
        "Pad",
      ]);
    });

    it("trims whitespace from names", () => {
      expect(parseCommaSeparatedNames(" Lead , Pad , Bass ", 3)).toStrictEqual([
        "Lead",
        "Pad",
        "Bass",
      ]);
    });
  });

  describe("getNameForIndex", () => {
    it("returns undefined when baseName is undefined", () => {
      expect(getNameForIndex(undefined, 0, null)).toBeUndefined();
    });

    it("returns baseName when parsedNames is null", () => {
      expect(getNameForIndex("Lead", 0, null)).toBe("Lead");
      expect(getNameForIndex("Lead", 2, null)).toBe("Lead");
    });

    it("returns parsed name at index", () => {
      const parsed = ["Lead", "Pad", "Bass"];

      expect(getNameForIndex("Lead,Pad,Bass", 0, parsed)).toBe("Lead");
      expect(getNameForIndex("Lead,Pad,Bass", 1, parsed)).toBe("Pad");
      expect(getNameForIndex("Lead,Pad,Bass", 2, parsed)).toBe("Bass");
    });

    it("returns undefined when index exceeds parsed names", () => {
      const parsed = ["Lead", "Pad"];

      expect(getNameForIndex("Lead,Pad", 2, parsed)).toBeUndefined();
    });
  });
});

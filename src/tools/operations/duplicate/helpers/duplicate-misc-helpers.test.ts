// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  focusIfRequested,
  parseCommaSeparatedNames,
  getNameForIndex,
} from "./duplicate-misc-helpers.ts";

// Mock the select module to avoid Live API dependencies
vi.mock(import("#src/tools/control/select.ts"), () => ({
  select: vi.fn(),
}));

describe("duplicate-misc-helpers", () => {
  describe("focusIfRequested", () => {
    let selectMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      vi.clearAllMocks();
      const selectModule = await import("#src/tools/control/select.ts");

      selectMock = selectModule.select as ReturnType<typeof vi.fn>;
    });

    it("does nothing when focus is false", () => {
      focusIfRequested(false, "arrangement", "clip", [{ id: "clip1" }]);

      expect(selectMock).not.toHaveBeenCalled();
    });

    it("does nothing when focus is undefined", () => {
      focusIfRequested(undefined, "arrangement", "clip", [{ id: "clip1" }]);

      expect(selectMock).not.toHaveBeenCalled();
    });

    it("selects clip with detail view when type is clip", () => {
      focusIfRequested(true, "arrangement", "clip", [{ id: "clip1" }]);

      expect(selectMock).toHaveBeenCalledWith({
        clipId: "clip1",
        detailView: "clip",
      });
    });

    it("selects last clip when multiple clips are duplicated", () => {
      focusIfRequested(true, "arrangement", "clip", [
        { id: "clip1" },
        { id: "clip2" },
      ]);

      expect(selectMock).toHaveBeenCalledWith({
        clipId: "clip2",
        detailView: "clip",
      });
    });

    it("selects scene in session view when type is scene", () => {
      focusIfRequested(true, undefined, "scene", [{ id: "scene1" }]);

      expect(selectMock).toHaveBeenCalledWith({
        view: "session",
        sceneId: "scene1",
      });
    });

    it("does nothing when destination is undefined and type is device", () => {
      focusIfRequested(true, undefined, "device", [{ id: "device1" }]);

      expect(selectMock).not.toHaveBeenCalled();
    });

    it("does nothing when type is track", () => {
      focusIfRequested(true, undefined, "track", [{ id: "track1" }]);

      expect(selectMock).not.toHaveBeenCalled();
    });

    it("falls back to view switch for clips without id", () => {
      focusIfRequested(true, "session", "clip", [{}]);

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

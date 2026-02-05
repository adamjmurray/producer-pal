// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateObjectName,
  switchViewIfRequested,
} from "./duplicate-misc-helpers.ts";

// Mock the select module to avoid Live API dependencies
vi.mock(import("#src/tools/control/select.ts"), () => ({
  select: vi.fn(),
}));

describe("duplicate-misc-helpers", () => {
  describe("generateObjectName", () => {
    it("returns undefined when baseName is undefined", () => {
      expect(generateObjectName(undefined, 2, 0)).toBeUndefined();
    });

    it("returns undefined when baseName is null", () => {
      expect(
        generateObjectName(null as unknown as string, 2, 0),
      ).toBeUndefined();
    });

    it("returns baseName unchanged when count is 1", () => {
      expect(generateObjectName("My Track", 1, 0)).toBe("My Track");
    });

    it("returns baseName unchanged when index is 0 and count > 1", () => {
      expect(generateObjectName("My Track", 3, 0)).toBe("My Track");
    });

    it("returns baseName with number suffix for index > 0", () => {
      expect(generateObjectName("My Track", 3, 1)).toBe("My Track 2");
      expect(generateObjectName("My Track", 3, 2)).toBe("My Track 3");
    });

    it("handles empty string baseName", () => {
      expect(generateObjectName("", 1, 0)).toBe("");
      expect(generateObjectName("", 3, 1)).toBe(" 2");
    });
  });

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

    it("calls select with session view when type is track", () => {
      switchViewIfRequested(true, undefined, "track");

      expect(selectMock).toHaveBeenCalledWith({ view: "session" });
    });

    it("calls select with session view when type is scene", () => {
      switchViewIfRequested(true, undefined, "scene");

      expect(selectMock).toHaveBeenCalledWith({ view: "session" });
    });
  });
});

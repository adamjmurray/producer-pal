// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { setupSelectMock } from "#src/test/focus-test-helpers.ts";
import { focusIfRequested } from "../duplicate-misc-helpers.ts";

// Mock the select module to avoid Live API dependencies
vi.mock(import("#src/tools/control/select.ts"), () => ({
  select: vi.fn(),
}));

describe("duplicate-misc-helpers", () => {
  describe("focusIfRequested", () => {
    const selectMock = setupSelectMock();

    it("does nothing when focus is false", () => {
      focusIfRequested(false, "arrangement", "clip", [{ id: "clip1" }]);

      expect(selectMock.get()).not.toHaveBeenCalled();
    });

    it("does nothing when focus is undefined", () => {
      focusIfRequested(undefined, "arrangement", "clip", [{ id: "clip1" }]);

      expect(selectMock.get()).not.toHaveBeenCalled();
    });

    it("selects clip with detail view when type is clip", () => {
      focusIfRequested(true, "arrangement", "clip", [{ id: "clip1" }]);

      expect(selectMock.get()).toHaveBeenCalledWith({
        clipId: "clip1",
        detailView: "clip",
      });
    });

    it("selects last clip when multiple clips are duplicated", () => {
      focusIfRequested(true, "arrangement", "clip", [
        { id: "clip1" },
        { id: "clip2" },
      ]);

      expect(selectMock.get()).toHaveBeenCalledWith({
        clipId: "clip2",
        detailView: "clip",
      });
    });

    it("selects scene in session view when type is scene", () => {
      focusIfRequested(true, undefined, "scene", [{ id: "scene1" }]);

      expect(selectMock.get()).toHaveBeenCalledWith({
        view: "session",
        sceneId: "scene1",
      });
    });

    it("does nothing when destination is undefined and type is device", () => {
      focusIfRequested(true, undefined, "device", [{ id: "device1" }]);

      expect(selectMock.get()).not.toHaveBeenCalled();
    });

    it("does nothing when type is track", () => {
      focusIfRequested(true, undefined, "track", [{ id: "track1" }]);

      expect(selectMock.get()).not.toHaveBeenCalled();
    });

    it("falls back to view switch for clips without id", () => {
      focusIfRequested(true, "session", "clip", [{}]);

      expect(selectMock.get()).toHaveBeenCalledWith({ view: "session" });
    });

    it("falls back to arrangement view for clips without id when destination is arrangement", () => {
      focusIfRequested(true, "arrangement", "clip", [{}]);

      expect(selectMock.get()).toHaveBeenCalledWith({ view: "arrangement" });
    });

    it("does nothing for clips without id and no destination", () => {
      focusIfRequested(true, undefined, "clip", [{}]);

      expect(selectMock.get()).not.toHaveBeenCalled();
    });
  });

  // parseCommaSeparatedNames and getNameForIndex are re-exported from
  // name-utils.ts and tested in name-utils.test.ts
});

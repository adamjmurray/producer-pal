// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  clearMockRegistry,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  buildTrackPath,
  updateClipSlotSelection,
  updateHighlightedClipSlot,
  updateTrackSelection,
} from "#src/tools/session/helpers/select-helpers.ts";

/**
 * Register the song view backing mock and return both it (for `set` spy
 * assertions) and a real LiveAPI instance (which carries the prototype
 * methods like `setProperty`) to pass into the helpers under test.
 * @returns The backing mock and a LiveAPI instance for the song view
 */
function setupSongView(): { mock: RegisteredMockObject; api: LiveAPI } {
  const mock = registerMockObject("song-view", {
    path: livePath.view.song,
    type: "Song.View",
  });

  return { mock, api: LiveAPI.from(livePath.view.song) };
}

describe("select-helpers", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  describe("buildTrackPath", () => {
    it("defaults to the regular category when none is given", () => {
      expect(String(buildTrackPath(undefined, 2))).toBe(
        String(livePath.track(2)),
      );
    });

    it("returns null for a return track with no index", () => {
      expect(buildTrackPath("return", null)).toBeNull();
    });

    it("returns null for a regular track with no index", () => {
      expect(buildTrackPath("regular", null)).toBeNull();
    });

    it("returns the master path regardless of index", () => {
      expect(String(buildTrackPath("master", null))).toBe(
        String(livePath.masterTrack()),
      );
    });

    it("returns null for an unknown category", () => {
      expect(buildTrackPath("bogus", 0)).toBeNull();
    });
  });

  describe("updateTrackSelection", () => {
    it("selects by id without category or index", () => {
      const { mock, api } = setupSongView();

      registerMockObject("track-1", {
        path: String(livePath.track(0)),
        type: "Track",
      });

      const result = updateTrackSelection({
        songView: api,
        trackId: "track-1",
      });

      expect(result.selectedTrackId).toBe("id track-1");
      expect(mock.set).toHaveBeenCalledWith("selected_track", "id track-1");
    });

    it("selects by index alone", () => {
      const { api } = setupSongView();

      registerMockObject("track-by-index", {
        path: String(livePath.track(1)),
        type: "Track",
      });

      const result = updateTrackSelection({ songView: api, trackIndex: 1 });

      expect(result.selectedTrackId).toBe("id track-by-index");
    });
  });

  describe("updateHighlightedClipSlot", () => {
    it("does nothing when no clip slot is given", () => {
      const { mock, api } = setupSongView();

      updateHighlightedClipSlot({ songView: api });

      expect(mock.set).not.toHaveBeenCalled();
    });

    it("does nothing when the clip slot does not exist", () => {
      mockNonExistentObjects();
      const { mock, api } = setupSongView();

      updateHighlightedClipSlot({
        songView: api,
        clipSlot: { trackIndex: 9, sceneIndex: 9 },
      });

      expect(mock.set).not.toHaveBeenCalled();
    });
  });

  // A slot that isn't there is refused before this runs — see select-path.test.ts.
  describe("updateClipSlotSelection", () => {
    it("returns true but skips selecting the clip when the clip object is gone", () => {
      mockNonExistentObjects();
      const { mock, api } = setupSongView();

      // Clip slot exists and reports a clip, but the clip object itself does not.
      registerMockObject("clipslot-0-0", {
        path: String(livePath.track(0).clipSlot(0)),
        type: "ClipSlot",
        properties: { has_clip: 1 },
      });

      const result = updateClipSlotSelection({
        songView: api,
        clipSlot: { trackIndex: 0, sceneIndex: 0 },
      });

      expect(result).toBe(true);
      expect(mock.set).not.toHaveBeenCalledWith(
        "detail_clip",
        expect.anything(),
      );
    });
  });
});

import { vi } from "vitest";
import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

/**
 * Setup mocks for testing error scenarios with no clips in arrangement.
 * @param {number} [trackIndex] - Track index to mock (default: 0)
 * @returns {import("vitest").SpyInstance} Console error spy
 */
export function setupNoClipsInArrangementMocks(trackIndex = 0) {
  liveApiType.mockImplementation(function () {
    if (this._path === `live_set tracks ${trackIndex}`) return "Track";
  });
  liveApiGet.mockImplementation(function (prop) {
    if (this._path === "live_set") {
      if (prop === "signature_numerator") return [4];
      if (prop === "signature_denominator") return [4];
    }

    if (
      this._path === `live_set tracks ${trackIndex}` &&
      prop === "arrangement_clips"
    )
      return [];

    return [0];
  });

  return vi.spyOn(console, "error");
}

/**
 * Setup mocks for testing error scenarios with non-existent track.
 * @param {number} trackIndex - Track index that doesn't exist
 */
export function setupNonExistentTrackMocks(trackIndex) {
  liveApiId.mockImplementation(function () {
    if (this._path === `live_set tracks ${trackIndex}`) return "0";

    return this._id;
  });
  liveApiType.mockImplementation(function () {
    // Track doesn't exist - return undefined
  });
  liveApiGet.mockImplementation(function (prop) {
    if (this._path === "live_set") {
      if (prop === "signature_numerator") return [4];
      if (prop === "signature_denominator") return [4];
    }

    return [0];
  });
}

/**
 * @typedef {object} MockContext
 * @property {string} [_path] - Live API path
 * @property {string} [_id] - Live API ID
 * @property {string} [id] - Alternate ID property
 */

/**
 * @typedef {object} ClipConfig
 * @property {string} id - Clip ID
 * @property {number} startTime - Start time in beats
 * @property {number} [length] - Clip length in beats
 */

/**
 * Setup mocks for arrangement clip tests with multiple clips
 * @param {ClipConfig[]} clips - Array of clip configurations
 */
export function setupArrangementClipMocks(clips) {
  const clipIds = clips.map((c) => c.id);

  liveApiId.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      for (const clip of clips) {
        if (this._path === `id ${clip.id}`) {
          return clip.id;
        }
      }

      return this._id;
    },
  );

  liveApiPath.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      const idx = this._id ? clipIds.indexOf(this._id) : -1;

      if (idx !== -1) {
        return `live_set tracks 0 arrangement_clips ${idx}`;
      }

      return this._path;
    },
  );

  liveApiType.mockImplementation(
    /**
     * @this {MockContext}
     * @returns {string | undefined} Mock ID or undefined
     */
    function () {
      if (this._path === "live_set tracks 0") {
        return "Track";
      }

      if (this._id && clipIds.includes(this._id)) {
        return "Clip";
      }
    },
  );

  const arrangementClipsIds = clipIds.flatMap((id) => ["id", id]);

  liveApiGet.mockImplementation(
    /**
     * @this {MockContext}
     * @param {string} prop - Property name
     * @returns {unknown[]} Mock property value array
     */
    function (prop) {
      // LiveSet time signature
      if (this._path === "live_set") {
        if (prop === "signature_numerator") return [4];
        if (prop === "signature_denominator") return [4];
      }

      // Track arrangement clips
      if (this._path === "live_set tracks 0" && prop === "arrangement_clips") {
        return arrangementClipsIds;
      }

      // Clip properties
      const clip = clips.find((c) => c.id === this._id);

      if (clip) {
        if (prop === "start_time") return [clip.startTime];
        if (prop === "is_midi_clip") return [1];
        if (prop === "is_audio_clip") return [0];
        if (prop === "is_arrangement_clip") return [1];
        if (prop === "length") return [clip.length ?? 4.0];
      }

      return [0];
    },
  );
}

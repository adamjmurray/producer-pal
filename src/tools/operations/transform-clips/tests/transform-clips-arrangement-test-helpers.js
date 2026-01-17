import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mock-live-api.js";

/**
 * Setup mocks for arrangement clip tests with multiple clips
 * @param {object[]} clips - Array of clip configurations
 * @param {string} clips[].id - Clip ID
 * @param {number} clips[].startTime - Start time in beats
 * @param {number} [clips[].length=4.0] - Clip length in beats
 */
export function setupArrangementClipMocks(clips) {
  const clipIds = clips.map((c) => c.id);

  liveApiId.mockImplementation(function () {
    for (const clip of clips) {
      if (this._path === `id ${clip.id}`) {
        return clip.id;
      }
    }

    return this._id;
  });

  liveApiPath.mockImplementation(function () {
    const idx = clipIds.indexOf(this._id);

    if (idx !== -1) {
      return `live_set tracks 0 arrangement_clips ${idx}`;
    }

    return this._path;
  });

  liveApiType.mockImplementation(function () {
    if (this._path === "live_set tracks 0") {
      return "Track";
    }

    if (clipIds.includes(this._id)) {
      return "Clip";
    }
  });

  const arrangementClipsIds = clipIds.flatMap((id) => ["id", id]);

  liveApiGet.mockImplementation(function (prop) {
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
  });
}

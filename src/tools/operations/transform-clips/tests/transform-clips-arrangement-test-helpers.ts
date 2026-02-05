// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";

/**
 * Setup mocks for testing error scenarios with no clips in arrangement.
 * @param trackIndex - Track index to mock (default: 0)
 */
export function setupNoClipsInArrangementMocks(trackIndex = 0): void {
  liveApiType.mockImplementation(function (this: MockLiveAPIContext) {
    if (this._path === `live_set tracks ${trackIndex}`) return "Track";
  });
  liveApiGet.mockImplementation(function (
    this: MockLiveAPIContext,
    prop: string,
  ) {
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
}

/**
 * Setup mocks for testing error scenarios with non-existent track.
 * @param trackIndex - Track index that doesn't exist
 */
export function setupNonExistentTrackMocks(trackIndex: number): void {
  liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
    if (this._path === `live_set tracks ${trackIndex}`) return "0";

    return this._id ?? "";
  });
  liveApiType.mockImplementation(function (
    this: MockLiveAPIContext,
  ): string | undefined {
    // Track doesn't exist - return undefined
    return undefined;
  });
  liveApiGet.mockImplementation(function (
    this: MockLiveAPIContext,
    prop: string,
  ) {
    if (this._path === "live_set") {
      if (prop === "signature_numerator") return [4];
      if (prop === "signature_denominator") return [4];
    }

    return [0];
  });
}

interface ClipConfig {
  id: string;
  startTime: number;
  length?: number;
}

/**
 * Setup mocks for arrangement clip tests with multiple clips
 * @param clips - Array of clip configurations
 */
export function setupArrangementClipMocks(clips: ClipConfig[]): void {
  const clipIds = clips.map((c) => c.id);

  liveApiId.mockImplementation(
    /**
     * @this - Mock context
     * @returns Mock ID
     */
    function (this: MockLiveAPIContext): string {
      for (const clip of clips) {
        if (this._path === `id ${clip.id}`) {
          return clip.id;
        }
      }

      return this._id ?? "";
    },
  );

  liveApiPath.mockImplementation(
    /**
     * @this - Mock context
     * @returns Mock ID or undefined
     */
    function (this: MockLiveAPIContext): string | undefined {
      const idx = this._id ? clipIds.indexOf(this._id) : -1;

      if (idx !== -1) {
        return `live_set tracks 0 arrangement_clips ${idx}`;
      }

      return this._path;
    },
  );

  liveApiType.mockImplementation(
    /**
     * @this - Mock context
     * @returns Mock ID or undefined
     */
    function (this: MockLiveAPIContext): string | undefined {
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
     * @this - Mock context
     * @param prop - Property name
     * @returns Mock property value array
     */
    function (this: MockLiveAPIContext, prop: string): unknown[] {
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

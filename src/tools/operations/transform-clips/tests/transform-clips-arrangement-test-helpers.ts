import type { MockInstance } from "vitest";
import { vi } from "vitest";
import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

interface MockContext {
  _path?: string;
  _id?: string;
  id?: string;
}

/**
 * Setup mocks for testing error scenarios with no clips in arrangement.
 * @param trackIndex - Track index to mock (default: 0)
 * @returns Console error spy
 */
export function setupNoClipsInArrangementMocks(
  trackIndex = 0,
): MockInstance<typeof console.error> {
  liveApiType.mockImplementation(function (this: MockContext) {
    if (this._path === `live_set tracks ${trackIndex}`) return "Track";
  });
  liveApiGet.mockImplementation(function (this: MockContext, prop: string) {
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
 * @param trackIndex - Track index that doesn't exist
 */
export function setupNonExistentTrackMocks(trackIndex: number): void {
  liveApiId.mockImplementation(function (this: MockContext) {
    if (this._path === `live_set tracks ${trackIndex}`) return "0";

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test mock always has _id set
    return this._id!;
  });
  liveApiType.mockImplementation(function (
    this: MockContext,
  ): string | undefined {
    // Track doesn't exist - return undefined
    return undefined;
  });
  liveApiGet.mockImplementation(function (this: MockContext, prop: string) {
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
    function (this: MockContext): string {
      for (const clip of clips) {
        if (this._path === `id ${clip.id}`) {
          return clip.id;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test mock always has _id set
      return this._id!;
    },
  );

  liveApiPath.mockImplementation(
    /**
     * @this - Mock context
     * @returns Mock ID or undefined
     */
    function (this: MockContext): string | undefined {
      const idx = this._id ? clipIds.indexOf(this._id) : -1;

      if (idx !== -1) {
        return `live_set tracks 0 arrangement_clips ${idx}`;
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- Test mock always has _path set
      return this._path!;
    },
  );

  liveApiType.mockImplementation(
    /**
     * @this - Mock context
     * @returns Mock ID or undefined
     */
    function (this: MockContext): string | undefined {
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
    function (this: MockContext, prop: string): unknown[] {
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

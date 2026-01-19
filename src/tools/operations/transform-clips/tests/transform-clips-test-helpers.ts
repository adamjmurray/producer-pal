import type { MockInstance } from "vitest";
import {
  liveApiGet,
  liveApiId,
  liveApiPath,
  liveApiType,
} from "#src/test/mocks/mock-live-api.js";

interface ClipMockConfig {
  id: string;
  path?: string;
  isMidi?: boolean;
  isArrangement?: boolean;
  length?: number;
}

interface SessionClipMockOptions {
  isMidi?: boolean;
  length?: number;
}

interface MockContext {
  _path?: string;
  _id?: string;
}

/**
 * Setup mocks for multiple session clips in transform-clips tests.
 * @param clipIds - Array of clip IDs to mock
 * @param opts - Options
 */
export function setupSessionClipMocks(
  clipIds: string[],
  opts: SessionClipMockOptions = {},
): void {
  const { isMidi = true, length = 4.0 } = opts;

  const idToPath: Record<string, string> = {};

  for (const [i, id] of clipIds.entries()) {
    idToPath[id] = `live_set tracks 0 clip_slots ${i} clip`;
  }

  liveApiId.mockImplementation(function (this: MockContext) {
    for (const id of clipIds) {
      if (this._path === `id ${id}`) return id;
    }

    return this._id;
  });
  liveApiPath.mockImplementation(function (this: MockContext) {
    return idToPath[this._id as string] ?? this._path;
  });
  liveApiType.mockImplementation(function (this: MockContext) {
    return clipIds.includes(this._id as string) ? "Clip" : undefined;
  });
  liveApiGet.mockImplementation(function (this: MockContext, prop: string) {
    if (!clipIds.includes(this._id as string)) return [0];
    const props: Record<string, number[]> = {
      is_midi_clip: [isMidi ? 1 : 0],
      is_audio_clip: [isMidi ? 0 : 1],
      is_arrangement_clip: [0],
      length: [length],
    };

    return props[prop] ?? [0];
  });
}

interface SingleClipMockOptions {
  path?: string;
  isMidi?: boolean;
  isArrangement?: boolean;
  length?: number;
}

/**
 * Setup mocks for a single clip in transform-clips tests.
 * @param clipId - The clip ID to mock
 * @param opts - Options
 */
export function setupClipMocks(
  clipId: string,
  opts: SingleClipMockOptions = {},
): void {
  const {
    path = "live_set tracks 0 clip_slots 0 clip",
    isMidi = true,
    isArrangement = false,
    length = 4.0,
  } = opts;

  liveApiId.mockImplementation(function (this: MockContext) {
    return this._path === `id ${clipId}` ? clipId : this._id;
  });
  liveApiPath.mockImplementation(function (this: MockContext) {
    return this._id === clipId ? path : this._path;
  });
  liveApiType.mockImplementation(function (this: MockContext) {
    return this._id === clipId ? "Clip" : undefined;
  });
  liveApiGet.mockImplementation(function (this: MockContext, prop: string) {
    if (this._id !== clipId) return [0];
    const props: Record<string, number[]> = {
      is_midi_clip: [isMidi ? 1 : 0],
      is_audio_clip: [isMidi ? 0 : 1],
      is_arrangement_clip: [isArrangement ? 1 : 0],
      length: [length],
    };

    return props[prop] ?? [0];
  });
}

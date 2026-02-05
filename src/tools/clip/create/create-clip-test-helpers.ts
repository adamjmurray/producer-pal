// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  liveApiCall,
  liveApiId,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";

/**
 * Setup mocks for arrangement clip creation tests.
 * Configures LiveSet time signature and clip ID resolution.
 */
export function setupArrangementClipMocks(): void {
  mockLiveApiGet({
    Track: { exists: () => true },
    LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    arrangement_clip: { length: 4 }, // 1 bar in 4/4 = 4 beats
  });

  liveApiCall.mockImplementation((method, ..._args) => {
    if (method === "create_midi_clip") {
      return ["id", "arrangement_clip"];
    }

    return null;
  });

  liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
    if (this._path === "id arrangement_clip") {
      return "arrangement_clip";
    }

    return this._id;
  });
}

interface SetupAudioArrangementMocksOptions {
  clipLength?: number;
}

/**
 * Setup mocks for audio arrangement clip creation tests.
 * Configures LiveSet time signature, audio clip creation, and clip ID resolution.
 * @param options - Configuration options
 * @param options.clipLength - Length of the clip in beats (default: 8)
 */
export function setupAudioArrangementClipMocks(
  options: SetupAudioArrangementMocksOptions = {},
): void {
  const { clipLength = 8 } = options;

  liveApiCall.mockImplementation((method, ..._args) => {
    if (method === "create_audio_clip") {
      return ["id", "arrangement_audio_clip"];
    }

    return null;
  });

  liveApiId.mockImplementation(function (this: MockLiveAPIContext) {
    if (this._path === "id arrangement_audio_clip") {
      return "arrangement_audio_clip";
    }

    return this._id;
  });

  mockLiveApiGet({
    Track: { exists: () => true },
    LiveSet: { signature_numerator: 4, signature_denominator: 4 },
    "id arrangement_audio_clip": { length: clipLength },
  });
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What a clip tool call knows of scales, asked of Live at most once: the
// version check and the Live Set's scale. Holds plain values only, never a
// LiveAPI, and is built per call.

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { CLIP_IS_AUDIO, ignoredText } from "#src/shared/max/ignored-wording.ts";
import { liveVersionAtLeast } from "#src/tools/shared/helpers/live-api-values.ts";
import {
  readScaleMask,
  readScaleState,
  type ScaleState,
} from "./scale-reading.ts";

/** Live 12.4.15 gave clips a scale of their own. */
export const CLIP_SCALE_MIN_VERSION = "12.4.15";

/** The Live Set's scale, and the transform mask it makes. */
export interface SongScale extends ScaleState {
  /** Undefined when the scale is off or chromatic */
  mask: number | undefined;
}

/** What one call asks Live about scales, each asked once. */
export interface CallScale {
  /** Whether this Live gives clips a scale */
  supported: () => boolean;
  /** The Live Set's scale */
  song: () => SongScale;
  /**
   * The mask a clip's notes snap to: its own scale, or the Live Set's where
   * clips have none (older Live, audio clips).
   */
  clipMask: (clip: LiveAPI) => number | undefined;
}

/**
 * The scale questions for one call.
 * @returns A fresh set, which asks Live the first time each is needed
 */
export function newCallScale(): CallScale {
  let supported: boolean | undefined;
  let song: SongScale | undefined;

  const callScale: CallScale = {
    supported: () => {
      supported ??= liveVersionAtLeast(CLIP_SCALE_MIN_VERSION, {
        release: true,
      });

      return supported;
    },
    song: () => {
      song ??= readSongScale();

      return song;
    },
    clipMask: (clip) => {
      if (
        !callScale.supported() ||
        (clip.getProperty("is_audio_clip") as number) > 0
      ) {
        return callScale.song().mask;
      }

      const state = readScaleState(clip);

      return state.enabled ? readScaleMask(clip, state.rootNote) : undefined;
    },
  };

  return callScale;
}

/**
 * Read the Live Set's scale.
 * @returns The scale, with the mask when it is on
 */
function readSongScale(): SongScale {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const state = readScaleState(liveSet);

  return {
    ...state,
    mask: state.enabled ? readScaleMask(liveSet, state.rootNote) : undefined,
  };
}

/**
 * Why a clip can't take the `scale` param, when it can't.
 * @param isAudioClip - Whether the clip is audio, which has no use for a scale
 * @param supported - Whether this Live gives clips a scale
 * @returns The `scale ignored: ...` text, or null when the clip takes it
 */
export function clipScaleIgnoredText(
  isAudioClip: boolean,
  supported: boolean,
): string | null {
  if (isAudioClip) {
    return ignoredText("scale", CLIP_IS_AUDIO);
  }

  return supported
    ? null
    : ignoredText("scale", `requires Live ${CLIP_SCALE_MIN_VERSION} or later`);
}

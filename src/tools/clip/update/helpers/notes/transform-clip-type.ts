// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { transformIgnoredForClipType } from "#src/notation/transform/transform-clip-type.ts";
import { getTimeSignature } from "../clip-beat-positions.ts";
import { ignoreClipParams } from "../entries/clip-reasons.ts";
import { type ProcessSingleClipUpdateParams } from "../batch/process-single-clip-update.ts";

/**
 * Settle a clip's transforms before anything is written to it: one that does
 * nothing on this kind of clip (gain/pitchShift on
 * MIDI, everything else on audio) is dropped and said so on the clip's entry.
 * One that only partly applies still runs; what it skips is reported as it runs.
 * @param params - The clip's update params
 * @returns The params, without the transforms that can't apply
 */
export function checkTransformsForClipType(
  params: ProcessSingleClipUpdateParams,
): ProcessSingleClipUpdateParams {
  const { clip, transformString, preTransformString, reasons } = params;

  if (!transformString && !preTransformString) {
    return params;
  }

  const isAudioClip = (clip.getProperty("is_audio_clip") as number) > 0;
  const { timeSigDenominator } = getTimeSignature(params.timeSignature, clip);
  const checked = { ...params };

  // preTransforms on an audio clip are refused whole elsewhere
  const edits = isAudioClip
    ? ([["transforms", "transformString", transformString]] as const)
    : ([
        ["transforms", "transformString", transformString],
        ["preTransforms", "preTransformString", preTransformString],
      ] as const);

  for (const [param, key, value] of edits) {
    const reason = value
      ? transformIgnoredForClipType(value, isAudioClip, timeSigDenominator)
      : null;

    if (reason != null) {
      ignoreClipParams(reasons, clip.id, [param], reason);
      checked[key] = undefined;
    }
  }

  return checked;
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  CLIP_IS_STEP_SEQUENCER,
  ignoredText,
} from "#src/shared/max/ignored-wording.ts";
import { ignoreClipParams } from "../entries/clip-reasons.ts";
import { type ProcessSingleClipUpdateParams } from "../batch/process-single-clip-update.ts";

/**
 * Settle a step sequencer clip's note work before anything is written to it.
 * Live's notes API reaches only a hidden list there, so it "succeeds" and
 * changes nothing the user sees. Every note param is dropped and said so on the
 * clip's entry, the way an audio clip's are; the rest of the call still lands.
 * @param params - The clip's update params
 * @returns The params, without the note work the clip can't take
 */
export function ignoreNoteParamsOnStepSequencer(
  params: ProcessSingleClipUpdateParams,
): ProcessSingleClipUpdateParams {
  const { clip, reasons, quantize, quantizeGrid, quantizePitch } = params;
  const sentQuantize = [
    quantize != null ? "quantize" : null,
    quantizeGrid != null ? "quantizeGrid" : null,
    quantizePitch != null ? "quantizePitch" : null,
  ].filter((param) => param != null);
  const sent = [
    ...(params.notationString != null ? [["notes"]] : []),
    ...(params.preTransformString != null ? [["preTransforms"]] : []),
    ...(params.transformString != null ? [["transforms"]] : []),
    ...(sentQuantize.length > 0 ? [sentQuantize] : []),
    ...(params.duplicateLoop === true ? [["duplicateLoop"]] : []),
  ];

  // Nothing here touches notes, so the clip's type needn't be read at all.
  if (sent.length === 0 || !clip.isStepSequencerClip) {
    return params;
  }

  for (const names of sent) {
    ignoreClipParams(
      reasons,
      clip.id,
      names,
      ignoredText(names, CLIP_IS_STEP_SEQUENCER),
    );
  }

  return {
    ...params,
    notationString: undefined,
    transformString: undefined,
    preTransformString: undefined,
    quantize: undefined,
    quantizeGrid: undefined,
    quantizePitch: undefined,
    duplicateLoop: undefined,
  };
}

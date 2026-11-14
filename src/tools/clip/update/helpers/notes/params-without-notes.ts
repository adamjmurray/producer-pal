// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { noNotesReason } from "#src/tools/shared/clip/slot-contents/clip-kind.ts";
import { isReturnTrackClip } from "#src/tools/shared/clip/slot-contents/return-track-clips.ts";
import { ignoredText } from "#src/shared/max/ignored-wording.ts";
import { ignoreClipParams } from "../entries/clip-reasons.ts";
import { type ProcessSingleClipUpdateParams } from "../batch/process-single-clip-update.ts";

type Params = ProcessSingleClipUpdateParams;

/**
 * The note params of a call, each group said on its own.
 * @param params - The clip's update params
 * @returns The names of the note params the call sent, in groups
 */
function noteGroups(params: Params): string[][] {
  const { quantize, quantizeGrid, quantizePitch } = params;

  return [
    ...(params.notationString != null ? [["notes"]] : []),
    ...(params.preTransformString != null ? [["preTransforms"]] : []),
    ...(params.transformString != null ? [["transforms"]] : []),
    ...namesSent([
      ["quantize", quantize],
      ["quantizeGrid", quantizeGrid],
      ["quantizePitch", quantizePitch],
    ]),
    ...(params.duplicateLoop === true ? [["duplicateLoop"]] : []),
  ];
}

/**
 * The audio params of a call, in the groups an audio clip reads them in.
 * @param params - The clip's update params
 * @returns The names of the audio params the call sent, in groups
 */
function audioGroups(params: Params): string[][] {
  return [
    ...namesSent([
      ["gainDb", params.gainDb],
      ["pitchShift", params.pitchShift],
      ["warpMode", params.warpMode],
      ["warping", params.warping],
    ]),
    ...namesSent([
      ["warpOp", params.warpOp],
      ["warpBeatTime", params.warpBeatTime],
      ["warpSampleTime", params.warpSampleTime],
      ["warpDistance", params.warpDistance],
    ]),
    ...(params.scaleRequest != null ? [["scale"]] : []),
  ];
}

/**
 * The names among a group of params that the call sent, as one group.
 * @param pairs - Each param's name and what the call sent for it
 * @returns One group of the names sent, or none
 */
function namesSent(pairs: Array<[string, unknown]>): string[][] {
  const names = pairs
    .filter(([, value]) => value != null)
    .map(([name]) => name);

  return names.length === 0 ? [] : [names];
}

/**
 * Settle the params a clip with no reachable notes can't take, before anything
 * is written to it. A step sequencer clip's notes API reaches only a hidden
 * list, so it "succeeds" and changes nothing the user sees; an envelope clip
 * has no notes and no sample, so it takes neither note nor audio params. Each
 * one is dropped and said so on the clip's entry, the way an audio clip's are;
 * the rest of the call still lands.
 * @param params - The clip's update params
 * @returns The params, without the work the clip can't take
 */
export function ignoreParamsWithoutNotes(params: Params): Params {
  const { clip, reasons } = params;
  const onEnvelope = isReturnTrackClip(clip);
  const sent = onEnvelope
    ? [...noteGroups(params), ...audioGroups(params)]
    : noteGroups(params);

  // Nothing here touches notes, so the clip's type needn't be read at all.
  if (sent.length === 0) {
    return params;
  }

  const why = noNotesReason(clip);

  if (why == null) {
    return params;
  }

  for (const names of sent) {
    ignoreClipParams(reasons, clip.id, names, ignoredText(names, why));
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
    ...(onEnvelope && {
      gainDb: undefined,
      pitchShift: undefined,
      warpMode: undefined,
      warping: undefined,
      warpOp: undefined,
      warpBeatTime: undefined,
      warpSampleTime: undefined,
      warpDistance: undefined,
      scaleRequest: undefined,
    }),
  };
}

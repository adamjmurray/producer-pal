// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type CallScale,
  clipScaleIgnoredText,
} from "#src/tools/shared/schema/scale/call-scale.ts";
import { type ScaleRequest } from "#src/tools/shared/schema/scale/scale-parsing.ts";
import { applyScale } from "#src/tools/shared/schema/scale/scale-writing.ts";
import {
  type ClipReasons,
  ignoreClipParams,
  noteClipReadBack,
  noteClipReason,
  noteLanded,
} from "../entries/clip-reasons.ts";

/**
 * Write the clip's own scale, when the call sets one. An audio clip, or a Live
 * that gives clips no scale, ignores it and says so on the clip's entry.
 * @param clip - The clip
 * @param request - The scale this clip is asked to take, if any
 * @param reasons - What each clip has to say, added to
 * @param isAudioClip - Whether the clip is audio
 * @param callScale - What the call asked Live about scales
 */
export function writeClipScaleParam(
  clip: LiveAPI,
  request: ScaleRequest | undefined,
  reasons: ClipReasons,
  isAudioClip: boolean,
  callScale: CallScale,
): void {
  if (request == null) {
    return;
  }

  const ignored = clipScaleIgnoredText(isAudioClip, callScale.supported());

  if (ignored != null) {
    ignoreClipParams(reasons, clip.id, ["scale"], ignored);

    return;
  }

  const outcome: { scale?: string; detail?: string } = {};

  applyScale(clip, request.parsed, request.requested, outcome, () =>
    noteLanded(reasons, "scale", { id: clip.id }),
  );

  if (outcome.scale != null) {
    noteClipReadBack(reasons, clip.id, { scale: outcome.scale });
  }

  if (outcome.detail != null) {
    noteClipReason(reasons, clip.id, outcome.detail);
  }
}

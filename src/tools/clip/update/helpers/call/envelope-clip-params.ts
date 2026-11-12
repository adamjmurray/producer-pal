// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  CLIP_IS_ENVELOPE,
  ignoredText,
} from "#src/shared/max/ignored-wording.ts";
import {
  ENVELOPES_ON_RETURN_CLIPS_NOT_YET,
  isReturnTrackClip,
} from "#src/tools/shared/clip/slot-contents/return-track-clips.ts";
import { type ClipReasons, ignoreClipParams } from "../entries/clip-reasons.ts";
import { type ClipCall } from "./parse-clip-call.ts";

/** The call-wide params that go on running after a clip's own update. */
export interface AfterUpdateParams {
  envelopeLines: ClipCall["envelopeLines"];
  convert: ClipCall["args"]["convert"];
}

/**
 * What an envelope clip can't take of the params that run after its update:
 * `envelopes` can't be written to it yet, and it has no sample to convert. Each
 * one the call sent is said on the clip's entry; the rest of the call lands.
 * @param clip - The clip the call is updating
 * @param call - The update-clip call
 * @param reasons - What each clip has to say beyond its result, added to
 * @returns The params the clip goes on to take
 */
export function afterUpdateParams(
  clip: LiveAPI,
  call: ClipCall,
  reasons: ClipReasons,
): AfterUpdateParams {
  const { envelopeLines } = call;
  const { convert } = call.args;

  if (!isReturnTrackClip(clip)) {
    return { envelopeLines, convert };
  }

  if (envelopeLines != null) {
    ignoreClipParams(
      reasons,
      clip.id,
      ["envelopes"],
      ignoredText("envelopes", ENVELOPES_ON_RETURN_CLIPS_NOT_YET),
    );
  }

  if (convert != null) {
    ignoreClipParams(
      reasons,
      clip.id,
      ["convert"],
      ignoredText("convert", CLIP_IS_ENVELOPE),
    );
  }

  return { envelopeLines: undefined, convert: undefined };
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Everything a new clip is given after Live has made it empty. Each write that
// lands is said as it does (`step.landed`), so a step that throws leaves an
// entry that names what the clip has by then.

import {
  type AudioReadBack,
  readBackAudioClipProperties,
  setAudioClipProperties,
} from "#src/tools/clip/helpers/audio-clip-properties.ts";
import { applyAudioClipWarping } from "#src/tools/clip/helpers/audio-clip-warping.ts";
import { type Step } from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { buildClipProperties } from "../created-clip-result.ts";
import { type CreatePayload } from "./create-clip-targets.ts";
import { type CreateClipCall } from "./parse-create-call.ts";

/**
 * Give a new MIDI clip its region, name, color and notes.
 * @param step - The call's state for this target
 * @param clip - The new clip
 * @param payload - The target's payload
 */
export function configureMidiClip(
  step: Step<CreateClipCall>,
  clip: LiveAPI,
  payload: CreatePayload,
): void {
  const { plan, transform, name, color } = payload;
  const { timing } = plan;

  clip.setAll(
    buildClipProperties(
      timing.startBeats,
      timing.endBeats,
      timing.firstStartBeats,
      step.checked.args.looping ?? null,
      name,
      color ?? null,
      timing.timeSigNumerator,
      timing.timeSigDenominator,
      transform.clipLength,
    ),
  );
  step.landed("properties");

  // v0 notes were already filtered out by applyV0Deletions in interpretNotation
  if (transform.notes.length > 0) {
    clip.call("add_new_notes", { notes: transform.notes });
    step.landed("notes");
  }
}

/**
 * Give a new audio clip its name, color, meter and audio properties. The sample
 * defines the region, so there is no looping or timing to set; an explicit
 * timeSignature still applies, since it sets the clip's grid.
 * @param step - The call's state for this target
 * @param clip - The new clip
 * @param payload - The target's payload
 * @returns The audio values Live kept in place of the ones asked for
 */
export function configureAudioClip(
  step: Step<CreateClipCall>,
  clip: LiveAPI,
  payload: CreatePayload,
): AudioReadBack {
  const { args } = step.checked;
  const { timing } = payload.plan;
  const props: Record<string, unknown> = {};

  if (payload.name) {
    props.name = payload.name;
  }

  if (payload.color != null) {
    props.color = payload.color;
  }

  if (payload.plan.timeSignature != null) {
    props.signature_numerator = timing.timeSigNumerator;
    props.signature_denominator = timing.timeSigDenominator;
  }

  if (Object.keys(props).length > 0) {
    clip.setAll(props);
    step.landed("properties");
  }

  // Same order as update-clip: properties first, then the warp toggle, which is
  // the one with side effects on the clip region.
  const audio = {
    gainDb: args.gainDb ?? undefined,
    pitchShift: args.pitchShift ?? undefined,
    warpMode: args.warpMode ?? undefined,
  };

  setAudioClipProperties(clip, audio);

  if (Object.values(audio).some((value) => value != null)) {
    step.landed("audio properties");
  }

  applyAudioClipWarping(clip, args.warping);

  if (args.warping != null) {
    step.landed("warping");
  }

  return readBackAudioClipProperties(clip, audio);
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseNotation } from "#src/notation/notation.ts";
import { type TimeSignature } from "../clip-beat-positions.ts";
import { hasNoteEdits } from "./note-transforms.ts";
import { tryParseTransform } from "#src/notation/transform/transform-evaluator.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { failuresByMeter } from "#src/tools/clip/helpers/transform-meter-failures.ts";

/** The note edits one update-clip call sends a MIDI clip. */
export interface NoteEdits {
  notationString?: string;
  transformString?: string;
  preTransformString?: string;
  context: Partial<ToolContext>;
}

/**
 * Parse a MIDI clip's note edits, in the meter this update leaves it in, before
 * its first write, so one that can't be read leaves the clip untouched. Every
 * string sent must parse: whether any notes will be left to transform isn't
 * known yet.
 * @param edits - The clip's note edits
 * @param edits.notationString - New notes to merge, if sent
 * @param edits.transformString - Transforms applied after the merge, if sent
 * @param edits.preTransformString - Transforms applied before the merge, if sent
 * @param edits.context - Per-request context, for the notation in use
 * @param timeSigNumerator - The clip's meter numerator after this update
 * @param timeSigDenominator - The clip's meter denominator after this update
 */
export function parseNoteEdits(
  { notationString, transformString, preTransformString, context }: NoteEdits,
  timeSigNumerator: number,
  timeSigDenominator: number,
): void {
  if (notationString != null) {
    parseNotation(notationString, {
      notation: context.notation,
      timeSigNumerator,
      timeSigDenominator,
    });
  }

  for (const transforms of [preTransformString, transformString]) {
    if (transforms) {
      tryParseTransform(transforms, timeSigDenominator, timeSigNumerator);
    }
  }
}

/**
 * Refuse note edits that can't be read, before any clip is cut, moved or
 * written. Each distinct meter the MIDI clips will have is parsed once, because
 * a transform's time range depends on the meter. Audio clips ignore notes and
 * read transforms the way their own evaluator does (no meter), so only their
 * transforms are parsed.
 *
 * A syntax error, or an argument mistake that holds in every meter, always
 * refuses the call. An error in only some meters (a bar|beat range, a constant
 * that mixes note values or bar lengths with other terms) is that clip's own
 * problem, reported back so the caller can skip it, unless one of the clips that
 * fails is `strict`: a cut can't be undone. See {@link failuresByMeter}.
 * @param clips - The clips the call will update
 * @param edits - The call's note edits
 * @param meterOf - A clip's meter once this call has updated it
 * @param strictFor - Whether a failure must refuse the call for this clip
 * @returns Why each clip whose own meter can't read the edits can't be updated,
 *   by clip id
 */
export function refuseNoteEditsByMeter(
  clips: LiveAPI[],
  edits: NoteEdits,
  meterOf: (clip: LiveAPI) => TimeSignature,
  strictFor: (clip: LiveAPI) => boolean,
): Map<string, string> {
  const { notationString, transformString, preTransformString } = edits;

  const unreadable = new Map<string, string>();

  if (!hasNoteEdits(notationString, transformString, preTransformString)) {
    return unreadable;
  }

  // Keyed by meter, or "audio" for clips that read no meter.
  const groups = new Map<string, { meter?: TimeSignature; strict: boolean }>();
  const keyById = new Map<string, string>();

  for (const clip of clips) {
    const isAudio = (clip.getProperty("is_audio_clip") as number) > 0;
    const meter = isAudio ? undefined : meterOf(clip);
    const key =
      meter == null
        ? "audio"
        : `${meter.timeSigNumerator}/${meter.timeSigDenominator}`;
    const group = groups.get(key) ?? { meter, strict: false };

    group.strict ||= strictFor(clip);
    groups.set(key, group);
    keyById.set(clip.id, key);
  }

  const failed = failuresByMeter(groups, ({ meter }) => {
    if (meter == null) {
      parseAudioTransforms(edits);
    } else {
      parseNoteEdits(edits, meter.timeSigNumerator, meter.timeSigDenominator);
    }
  });

  for (const [id, key] of keyById) {
    if (failed.has(key)) {
      unreadable.set(id, errorMessage(failed.get(key)));
    }
  }

  return unreadable;
}

/**
 * Parse the transforms an audio clip would read, as its own evaluator does.
 * @param edits - The call's note edits
 */
function parseAudioTransforms(edits: NoteEdits): void {
  for (const transforms of [edits.preTransformString, edits.transformString]) {
    if (transforms) {
      tryParseTransform(transforms, 4, undefined, "audio");
    }
  }
}

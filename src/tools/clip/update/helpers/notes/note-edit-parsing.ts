// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseNotation } from "#src/notation/notation.ts";
import { type TimeSignature } from "../clip-beat-positions.ts";
import { hasNoteEdits } from "./note-transforms.ts";
import { TransformArgError } from "#src/notation/transform/transform-arg-checks.ts";
import { tryParseTransform } from "#src/notation/transform/transform-evaluator.ts";

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
 * A syntax error, or an argument check failure (the text is wrong for every
 * clip), fails everywhere and always refuses the call. An error in only
 * some meters is that clip's own problem and is left to its own parse, unless
 * one of the clips that fails is `strict`: a cut can't be undone.
 * @param clips - The clips the call will update
 * @param edits - The call's note edits
 * @param meterOf - A clip's meter once this call has updated it
 * @param strictFor - Whether a failure must refuse the call for this clip
 */
export function refuseNoteEditsByMeter(
  clips: LiveAPI[],
  edits: NoteEdits,
  meterOf: (clip: LiveAPI) => TimeSignature,
  strictFor: (clip: LiveAPI) => boolean,
): void {
  const { notationString, transformString, preTransformString } = edits;

  if (!hasNoteEdits(notationString, transformString, preTransformString)) {
    return;
  }

  // Keyed by meter, or "audio" for clips that read no meter.
  const groups = new Map<string, { meter?: TimeSignature; strict: boolean }>();

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
  }

  const errors: Array<{ error: unknown; strict: boolean }> = [];

  for (const { meter, strict } of groups.values()) {
    try {
      if (meter == null) {
        parseAudioTransforms(edits);
      } else {
        parseNoteEdits(edits, meter.timeSigNumerator, meter.timeSigDenominator);
      }
    } catch (error) {
      // Wrong for every clip, whatever its meter or type: never left to a clip.
      if (error instanceof TransformArgError) {
        throw error;
      }

      errors.push({ error, strict });
    }
  }

  if (
    errors.length > 0 &&
    (errors.some((e) => e.strict) || errors.length === groups.size)
  ) {
    throw (errors[0] as { error: unknown }).error;
  }
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

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  CLIP_IS_AUDIO,
  CLIP_IS_MIDI,
  ignoredText,
} from "#src/shared/max/ignored-wording.ts";
import { isNoteOp } from "./helpers/transform-evaluation.ts";
import {
  type TransformStatement,
  parse as parseTransform,
} from "./parser/transform-parser.ts";

/** Transform params that only mean something on an audio clip. */
export const AUDIO_PARAMETERS = new Set(["gain", "pitchShift"]);

/** What a transform asks of a clip of the wrong type. */
export interface WrongClipType {
  /** One reason per kind of statement that does nothing on this clip. */
  reasons: string[];
  /** Whether every statement does nothing, so the transform is refused. */
  all: boolean;
}

/**
 * Find the statements that do nothing on this kind of clip: gain/pitchShift on
 * MIDI, and everything but gain/pitchShift on audio (MIDI params, note ops).
 * @param ast - The parsed transform
 * @param isAudio - Whether the clip is audio
 * @returns Why they're ignored, and whether that is every statement
 */
export function wrongClipTypeStatements(
  ast: TransformStatement[],
  isAudio: boolean,
): WrongClipType {
  const params = new Set<string>();
  const noteOps = new Set<string>();
  let wrong = 0;

  for (const stmt of ast) {
    if (isNoteOp(stmt)) {
      if (isAudio) {
        noteOps.add(stmt.name);
        wrong++;
      }
    } else if (AUDIO_PARAMETERS.has(stmt.parameter) !== isAudio) {
      params.add(stmt.parameter);
      wrong++;
    }
  }

  const reasons: string[] = [];

  if (params.size > 0) {
    reasons.push(
      ignoredText([...params], isAudio ? CLIP_IS_AUDIO : CLIP_IS_MIDI),
    );
  }

  if (noteOps.size > 0) {
    reasons.push(ignoredText([...noteOps], CLIP_IS_AUDIO));
  }

  return { reasons, all: ast.length > 0 && wrong === ast.length };
}

/**
 * Whether a transform does nothing at all on a clip of this type. A transform
 * that doesn't parse says nothing here: the write that refuses it reports it.
 * @param transformString - The transform expressions
 * @param isAudio - Whether the clip is audio
 * @param timeSigDenominator - The clip's meter denominator
 * @returns Why it does nothing, or null when some of it applies or can't be read
 */
export function transformIgnoredForClipType(
  transformString: string,
  isAudio: boolean,
  timeSigDenominator: number,
): string | null {
  let ast: TransformStatement[];

  try {
    ast = parseTransform(transformString, { timeSigDenominator });
  } catch {
    return null;
  }

  const { reasons, all } = wrongClipTypeStatements(ast, isAudio);

  return all ? reasons.join("; ") : null;
}

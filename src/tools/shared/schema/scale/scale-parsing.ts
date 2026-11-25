// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  VALID_PITCH_CLASS_NAMES,
  numberToPitchClass,
  pitchClassToNumber,
} from "#src/shared/pitch.ts";
import { SCALE_REFUSAL, VALID_SCALE_NAMES } from "#src/tools/constants.ts";
import {
  splitList,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";

// Create lowercase versions for case-insensitive comparison
const VALID_PITCH_CLASS_NAMES_LOWERCASE = VALID_PITCH_CLASS_NAMES.map((name) =>
  name.toLowerCase(),
);
const VALID_SCALE_NAMES_LOWERCASE = VALID_SCALE_NAMES.map((name) =>
  name.toLowerCase(),
);

/** A scale string Live can hold, read out of the caller's spelling. */
export interface ParsedScale {
  /** The root's canonical spelling, which keeps the caller's sharp or flat */
  scaleRoot: string;
  /** The scale name as Live spells it */
  scaleName: string;
  /** The root's pitch class, which is all Live stores */
  scaleRootNumber: number;
}

/**
 * Reads a combined scale string like "C Major". Refuses one it can't read: the
 * scale covers the whole call, so a value nothing can be done with is an error
 * rather than a warning attached to a result that reads as a success.
 * @param scaleString - Scale in format "Root ScaleName"
 * @returns The root's spelling and pitch class, and the scale name Live stores
 * @throws Error naming what Live accepts when the string isn't one of them
 */
export function parseScale(scaleString: string): ParsedScale {
  const trimmed = scaleString.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length < 2) {
    throw new Error(
      `Scale must be in format 'Root ScaleName' (e.g., 'C Major'), got: ${scaleString}. ${SCALE_REFUSAL}`,
    );
  }

  const scaleRoot = parts[0] as string;
  const scaleNameParts = parts.slice(1);
  const scaleName = scaleNameParts.join(" ");
  const scaleNameLower = scaleName.toLowerCase();
  const canonicalRoot = canonicalizeScaleRoot(scaleRoot);
  const scaleRootNumber =
    canonicalRoot == null ? null : pitchClassToNumber(canonicalRoot);

  if (canonicalRoot == null || scaleRootNumber == null) {
    throw new Error(
      `Invalid scale root '${scaleRoot}'. Valid roots: ${VALID_PITCH_CLASS_NAMES.join(", ")}. ${SCALE_REFUSAL}`,
    );
  }

  const scaleNameIndex = VALID_SCALE_NAMES_LOWERCASE.indexOf(scaleNameLower);

  if (scaleNameIndex === -1) {
    throw new Error(
      `Invalid scale name '${scaleName}'. Valid scales: ${VALID_SCALE_NAMES.join(", ")}. ${SCALE_REFUSAL}`,
    );
  }

  return {
    scaleRoot: canonicalRoot,
    scaleName: VALID_SCALE_NAMES[scaleNameIndex] as string,
    scaleRootNumber,
  };
}

/**
 * Canonicalize a scale root's spelling. A listed name keeps the user's choice of
 * sharp or flat (F# stays F#); an enharmonic (Cb, E#) isn't listed, so it falls
 * back to the canonical flat for the pitch it names.
 * @param scaleRoot - Root as the user wrote it
 * @returns The canonical spelling, or null if it names no pitch class
 */
function canonicalizeScaleRoot(scaleRoot: string): string | null {
  const index = VALID_PITCH_CLASS_NAMES_LOWERCASE.indexOf(
    scaleRoot.toLowerCase(),
  );

  if (index !== -1) {
    return VALID_PITCH_CLASS_NAMES[index] as string;
  }

  const pitchClass = pitchClassToNumber(scaleRoot);

  return pitchClass == null ? null : numberToPitchClass(pitchClass);
}

/** The scale one clip is asked to take. */
export interface ScaleRequest {
  /** The scale as the caller wrote it, trimmed */
  requested: string;
  /** The scale read, or null to switch the clip's scale off (`""`) */
  parsed: ParsedScale | null;
}

/**
 * Read a `scale` param against the clips a call acts on: one scale covers them
 * all, a list pairs 1:1. Every scale is read here, so a bad one refuses the
 * call before any clip is touched. A blank turns the scale off, for the whole
 * call (a blank inside a list is refused, as for `name`).
 * @param value - The param as sent
 * @param count - How many clips the call acts on
 * @returns One request per clip, undefined for a clip the call sets no scale on
 * @throws Error when a list has an empty entry, or a scale can't be read
 */
export function parseScaleRequests(
  value: string | null | undefined,
  count: number,
): Array<ScaleRequest | undefined> {
  const entries = splitList(value ?? undefined, count, "scale");

  return Array.from({ length: count }, (_unused, index) => {
    const requested = valueForIndex(value ?? undefined, index, entries);

    return requested == null
      ? undefined
      : {
          requested,
          parsed: requested === "" ? null : parseScale(requested),
        };
  });
}

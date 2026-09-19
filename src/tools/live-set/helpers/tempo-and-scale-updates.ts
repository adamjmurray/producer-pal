// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VALID_PITCH_CLASS_NAMES,
  numberToPitchClass,
  pitchClassToNumber,
} from "#src/shared/pitch.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { VALID_SCALE_NAMES } from "#src/tools/constants.ts";
import {
  type PublishedValue,
  differsAtPublishedResolution,
  publishedReadBack,
} from "#src/tools/shared/helpers/read-back-comparison.ts";
import { round2dp } from "#src/tools/shared/helpers/rounding.ts";

// Create lowercase versions for case-insensitive comparison
const VALID_PITCH_CLASS_NAMES_LOWERCASE = VALID_PITCH_CLASS_NAMES.map((name) =>
  name.toLowerCase(),
);
const VALID_SCALE_NAMES_LOWERCASE = VALID_SCALE_NAMES.map((name) =>
  name.toLowerCase(),
);

/**
 * Apply tempo to live set, with validation. Reported only when Live kept a
 * different tempo — an echo of the argument says nothing.
 * @param liveSet - The live_set object
 * @param tempo - Tempo in BPM
 * @param result - Result object to update
 * @param result.tempo - Tempo property to set
 */
export function applyTempo(
  liveSet: LiveAPI,
  tempo: number,
  result: { tempo?: PublishedValue },
): void {
  // Range already refused by validateTempo, before any property was written.
  liveSet.set("tempo", tempo);

  const landed = publishedReadBack(liveSet.getProperty("tempo"), round2dp);

  if (landed != null && differsAtPublishedResolution(tempo, landed, round2dp)) {
    result.tempo = landed;
  }
}

/**
 * Apply a time signature to the live set, reporting it only when Live kept a
 * different one.
 * @param liveSet - The live_set object
 * @param signature - The time signature as parsed from the argument
 * @param signature.numerator - Beats per bar
 * @param signature.denominator - The beat's note value
 * @param result - Result object to update
 * @param result.timeSignature - Time signature property to set
 */
export function applyTimeSignature(
  liveSet: LiveAPI,
  signature: { numerator: number; denominator: number },
  result: { timeSignature?: string },
): void {
  liveSet.set("signature_numerator", signature.numerator);
  liveSet.set("signature_denominator", signature.denominator);

  const landed = `${String(liveSet.getProperty("signature_numerator"))}/${String(liveSet.getProperty("signature_denominator"))}`;

  if (landed !== `${signature.numerator}/${signature.denominator}`) {
    result.timeSignature = landed;
  }
}

/**
 * Apply scale to live set, with validation
 * @param liveSet - The live_set object
 * @param scale - Scale string (e.g., "C Major") or empty string to disable
 * @param result - Result object to update
 * @param result.scale - Scale property to set
 * @returns Both root spellings when the root is reported under a different name
 *   than the caller asked for (F# -> Gb), otherwise null
 */
export function applyScale(
  liveSet: LiveAPI,
  scale: string,
  result: { scale?: string },
): { requestedRoot: string; storedRoot: string } | null {
  if (scale === "") {
    liveSet.set("scale_mode", 0);
    result.scale = "";

    return null;
  }

  // Warn and skip on an invalid scale rather than throwing, so other updates in
  // the same call (e.g. tempo) still apply and the tool returns a partial result
  // instead of a hard error. parseScale's messages are already descriptive.
  let parsed: { scaleRoot: string; scaleName: string };

  try {
    parsed = parseScale(scale);
  } catch (error) {
    console.warn(error instanceof Error ? error.message : String(error));

    return null;
  }

  const { scaleRoot, scaleName } = parsed;
  const scaleRootNumber = pitchClassToNumber(scaleRoot);

  if (scaleRootNumber == null) {
    console.warn(`invalid scale root: ${scaleRoot}`);

    return null;
  }

  liveSet.set("root_note", scaleRootNumber);
  liveSet.set("scale_name", scaleName);
  liveSet.set("scale_mode", 1);

  // Report the name Live stores, not the spelling asked for. Live keeps only a
  // pitch class number, so every read of it comes back flat ("F#" -> "Gb") —
  // echoing the request here would disagree with every later read.
  const storedRoot =
    numberToPitchClass(liveSet.getProperty("root_note") as number) ?? scaleRoot;
  const storedName = liveSet.getProperty("scale_name");

  result.scale = `${storedRoot} ${String(storedName)}`;

  return storedRoot === scaleRoot
    ? null
    : { requestedRoot: scaleRoot, storedRoot };
}

/**
 * Parses a combined scale string like "C Major" into root note and scale name
 * @param scaleString - Scale in format "Root ScaleName"
 * @returns Parsed components
 */
export function parseScale(scaleString: string): {
  scaleRoot: string;
  scaleName: string;
} {
  const trimmed = scaleString.trim();
  const parts = trimmed.split(/\s+/);

  if (parts.length < 2) {
    throw new Error(
      `Scale must be in format 'Root ScaleName' (e.g., 'C Major'), got: ${scaleString}`,
    );
  }

  const scaleRoot = parts[0] as string;
  const scaleNameParts = parts.slice(1);
  const scaleName = scaleNameParts.join(" ");
  const scaleNameLower = scaleName.toLowerCase();
  const canonicalRoot = canonicalizeScaleRoot(scaleRoot);

  if (canonicalRoot == null) {
    throw new Error(
      `Invalid scale root '${scaleRoot}'. Valid roots: ${VALID_PITCH_CLASS_NAMES.join(", ")}`,
    );
  }

  const scaleNameIndex = VALID_SCALE_NAMES_LOWERCASE.indexOf(scaleNameLower);

  if (scaleNameIndex === -1) {
    throw new Error(
      `Invalid scale name '${scaleName}'. Valid scales: ${VALID_SCALE_NAMES.join(", ")}`,
    );
  }

  return {
    scaleRoot: canonicalRoot,
    scaleName: VALID_SCALE_NAMES[scaleNameIndex] as string,
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

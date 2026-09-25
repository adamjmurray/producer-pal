// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  VALID_PITCH_CLASS_NAMES,
  numberToPitchClass,
  pitchClassToNumber,
} from "#src/shared/pitch.ts";
import { SCALE_REFUSAL, VALID_SCALE_NAMES } from "#src/tools/constants.ts";
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
 * Apply a scale to the live set, or disable it. Reported only when Live stores
 * a different spelling than the one asked for.
 * @param liveSet - The live_set object
 * @param parsed - The scale, already read by parseScale, or null to disable it
 * @param requested - The scale as the caller wrote it
 * @param result - Result object to update
 * @param result.scale - The scale Live stores, when it isn't the one asked for
 * @param result.detail - Why the spelling isn't the one asked for
 */
export function applyScale(
  liveSet: LiveAPI,
  parsed: ParsedScale | null,
  requested: string,
  result: { scale?: string; detail?: string },
): void {
  if (parsed == null) {
    liveSet.set("scale_mode", 0);

    return;
  }

  const { scaleRoot, scaleName, scaleRootNumber } = parsed;

  liveSet.set("root_note", scaleRootNumber);
  liveSet.set("scale_name", scaleName);
  liveSet.set("scale_mode", 1);

  // Live keeps only a pitch class number, so every read of the root comes back
  // flat ("F#" -> "Gb"). Report what it stores, or a later read disagrees.
  const storedRoot =
    numberToPitchClass(liveSet.getProperty("root_note") as number) ?? scaleRoot;
  const landed = `${storedRoot} ${String(liveSet.getProperty("scale_name"))}`;

  if (landed === requested.trim()) {
    return;
  }

  result.scale = landed;
  // Without the detail, a model that asked for F# sees Gb come back and
  // retries, thinking the write failed.
  result.detail =
    storedRoot === scaleRoot
      ? `scale ${requested.trim()} is spelled ${landed} — same scale, set correctly`
      : `scale roots are spelled with flats, so ${scaleRoot} comes back as ${storedRoot} — same scale, set correctly`;
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

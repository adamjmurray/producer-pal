// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { DEFAULT_BEATS_PER_BAR } from "#src/notation/barbeat/barbeat-config.ts";

interface BeatsPerBarOptions {
  beatsPerBar?: number;
  timeSigNumerator?: number;
  timeSigDenominator?: number;
}

/**
 * Parses beatsPerBar from options, validating time signature consistency.
 * @param options - Beats per bar configuration options
 * @returns Beats per bar value
 * @throws If only one of timeSigNumerator/timeSigDenominator is specified
 */
export function parseBeatsPerBar(options: BeatsPerBarOptions = {}): number {
  const {
    beatsPerBar: beatsPerBarOption,
    timeSigNumerator,
    timeSigDenominator,
  } = options;

  if (
    (timeSigNumerator != null && timeSigDenominator == null) ||
    (timeSigDenominator != null && timeSigNumerator == null)
  ) {
    throw new Error(
      "Time signature must be specified with both numerator and denominator",
    );
  }

  return timeSigNumerator ?? beatsPerBarOption ?? DEFAULT_BEATS_PER_BAR;
}

/**
 * Convert beats to bar|beat format.
 * TODO: rename the non-duration-based functions in here (i.e. not the last two) to clearly indicate we are handling bar|beat positions
 * @param beats - Number of beats
 * @param beatsPerBar - Beats per bar
 * @returns Formatted bar|beat string
 */
export function beatsToBarBeat(beats: number, beatsPerBar: number): string {
  const bar = Math.floor(beats / beatsPerBar) + 1;
  const beat = (beats % beatsPerBar) + 1;

  // Format beat - avoid unnecessary decimals

  const beatFormatted =
    beat % 1 === 0 ? beat.toString() : beat.toFixed(3).replace(/\.?0+$/, "");

  return `${bar}|${beatFormatted}`;
}

/**
 * Convert bar|beat format to beats
 * @param barBeat - Bar|beat string like "1|2" or "2|3.5"
 * @param beatsPerBar - Beats per bar
 * @returns Number of beats
 */
export function barBeatToBeats(barBeat: string, beatsPerBar: number): number {
  const match = barBeat.match(
    /^(-?\d+)\|((-?\d+)(?:\+\d+\/\d+|\.\d+|\/\d+)?)$/,
  );

  if (!match) {
    throw new Error(
      `Invalid bar|beat format: "${barBeat}". Expected "{int}|{float}" like "1|2" or "2|3.5" or "{int}|{int}/{int}" like "1|4/3" or "{int}|{int}+{int}/{int}" like "1|2+1/3"`,
    );
  }

  const bar = Number.parseInt(match[1] as string);
  const beatStr = match[2] as string;
  const beat = parseBeatValue(beatStr, barBeat, "bar|beat");

  if (bar < 1) {
    throw new Error(`Bar number must be 1 or greater, got: ${bar}`);
  }

  if (beat < 1) {
    throw new Error(`Beat must be 1 or greater, got: ${beat}`);
  }

  return (bar - 1) * beatsPerBar + (beat - 1);
}

/**
 * Convert time signature to Ableton beats (quarter notes) per bar
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Ableton beats per bar
 */
export function timeSigToAbletonBeatsPerBar(
  timeSigNumerator: number,
  timeSigDenominator: number,
): number {
  return (timeSigNumerator * 4) / timeSigDenominator;
}

/**
 * Convert Ableton beats (quarter notes) to bar|beat format using musical beats
 * @param abletonBeats - Ableton beats (quarter notes)
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Formatted bar|beat string
 */
export function abletonBeatsToBarBeat(
  abletonBeats: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
): string {
  const musicalBeatsPerBar = timeSigNumerator;
  const musicalBeats = abletonBeats * (timeSigDenominator / 4);

  return beatsToBarBeat(musicalBeats, musicalBeatsPerBar);
}

/**
 * Convert bar|beat format to Ableton beats (quarter notes) using musical beats
 * @param barBeat - Bar|beat string
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Ableton beats (quarter notes)
 */
export function barBeatToAbletonBeats(
  barBeat: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number {
  const musicalBeatsPerBar = timeSigNumerator;
  const musicalBeats = barBeatToBeats(barBeat, musicalBeatsPerBar);

  return musicalBeats * (4 / timeSigDenominator);
}

/**
 * Convert Ableton beats (quarter notes) to bar:beat duration format using musical beats
 * @param abletonBeats - Ableton beats (quarter notes)
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Formatted bar:beat duration string
 */
export function abletonBeatsToBarBeatDuration(
  abletonBeats: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
): string {
  if (abletonBeats < 0) {
    throw new Error(`Duration cannot be negative, got: ${abletonBeats}`);
  }

  // Convert Ableton beats to musical beats
  const musicalBeats = abletonBeats * (timeSigDenominator / 4);
  const musicalBeatsPerBar = timeSigNumerator;

  // Calculate bars and remaining beats (0-based for duration)
  const bars = Math.floor(musicalBeats / musicalBeatsPerBar);
  const remainingBeats = musicalBeats % musicalBeatsPerBar;

  // Format remaining beats - avoid unnecessary decimals
  const beatsFormatted =
    remainingBeats % 1 === 0
      ? remainingBeats.toString()
      : remainingBeats.toFixed(3).replace(/\.?0+$/, "");

  return `${bars}:${beatsFormatted}`;
}

/**
 * Parse a beat value string (supports fractions and mixed numbers)
 * @param beatsStr - Beat value string
 * @param context - Original string for error messages
 * @param formatType - Type of format for error messages (e.g., "duration", "bar|beat")
 * @returns Parsed beat value
 */
function parseBeatValue(
  beatsStr: string,
  context: string,
  formatType = "duration",
): number {
  if (beatsStr.includes("+")) {
    const plusParts = beatsStr.split("+");
    const intPart = plusParts[0] as string;
    const fracPart = plusParts[1] as string;
    const num = Number.parseInt(intPart);

    if (Number.isNaN(num)) {
      throw new Error(`Invalid ${formatType} format: "${context}"`);
    }

    const slashParts = fracPart.split("/");
    const numerator = slashParts[0] as string;
    const denominator = slashParts[1] as string;
    const fracNum = Number.parseInt(numerator);
    const fracDen = Number.parseInt(denominator);

    if (fracDen === 0) {
      throw new Error(
        `Invalid ${formatType} format: division by zero in "${context}"`,
      );
    }

    if (Number.isNaN(fracNum) || Number.isNaN(fracDen)) {
      throw new Error(`Invalid ${formatType} format: "${context}"`);
    }

    return num + fracNum / fracDen;
  }

  if (beatsStr.includes("/")) {
    const parts = beatsStr.split("/");
    const numerator = parts[0] as string;
    const denominator = parts[1] as string;
    const num = Number.parseInt(numerator);
    const den = Number.parseInt(denominator);

    if (den === 0) {
      throw new Error(
        `Invalid ${formatType} format: division by zero in "${context}"`,
      );
    }

    if (Number.isNaN(num) || Number.isNaN(den)) {
      throw new Error(`Invalid ${formatType} format: "${context}"`);
    }

    return num / den;
  }

  const beats = Number.parseFloat(beatsStr);

  if (Number.isNaN(beats)) {
    throw new Error(`Invalid ${formatType} format: "${context}"`);
  }

  return beats;
}

/**
 * Parse bar:beat format and return musical beats
 * @param barBeatDuration - Bar:beat duration string
 * @param timeSigNumerator - Time signature numerator
 * @returns Musical beats
 */
function parseBarBeatFormat(
  barBeatDuration: string,
  timeSigNumerator: number,
): number {
  const match = barBeatDuration.match(
    /^(-?\d+):((-?\d+)(?:\+\d+\/\d+|\.\d+|\/\d+)?)$/,
  );

  if (!match) {
    throw new Error(
      `Invalid bar:beat duration format: "${barBeatDuration}". Expected "{int}:{float}" like "1:2" or "2:1.5" or "{int}:{int}/{int}" like "0:4/3" or "{int}:{int}+{int}/{int}" like "1:2+1/3"`,
    );
  }

  const bars = Number.parseInt(match[1] as string);
  const beatsStr = match[2] as string;
  const beats = parseBeatValue(beatsStr, barBeatDuration);

  if (bars < 0) {
    throw new Error(`Bars in duration must be 0 or greater, got: ${bars}`);
  }

  if (beats < 0) {
    throw new Error(`Beats in duration must be 0 or greater, got: ${beats}`);
  }

  const musicalBeatsPerBar = timeSigNumerator;

  return bars * musicalBeatsPerBar + beats;
}

/**
 * Convert bar:beat or beat-only duration to musical beats
 * @param barBeatDuration - Bar:beat duration string or beat-only string
 * @param timeSigNumerator - Time signature numerator (required for bar:beat format)
 * @returns Musical beats
 */
export function barBeatDurationToMusicalBeats(
  barBeatDuration: string,
  timeSigNumerator: number | undefined,
): number {
  // Check if it's bar:beat format or beat-only
  if (barBeatDuration.includes(":")) {
    if (timeSigNumerator == null) {
      throw new Error(
        `Time signature numerator required for bar:beat duration format: "${barBeatDuration}"`,
      );
    }

    return parseBarBeatFormat(barBeatDuration, timeSigNumerator);
  }

  // Beat-only format (decimal, fraction, or integer+fraction)
  if (barBeatDuration.includes("|")) {
    throw new Error(
      `Invalid duration format: "${barBeatDuration}". Use ":" for bar:beat format, not "|"`,
    );
  }

  const beats = parseBeatValue(barBeatDuration, barBeatDuration);

  if (beats < 0) {
    throw new Error(`Beats in duration must be 0 or greater, got: ${beats}`);
  }

  return beats;
}

/**
 * Convert bar:beat or beat-only duration to Ableton beats (quarter notes)
 * @param barBeatDuration - Bar:beat duration string or beat-only string
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Ableton beats (quarter notes)
 */
export function barBeatDurationToAbletonBeats(
  barBeatDuration: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number {
  const musicalBeats = barBeatDurationToMusicalBeats(
    barBeatDuration,
    timeSigNumerator,
  );

  return musicalBeats * (4 / timeSigDenominator);
}

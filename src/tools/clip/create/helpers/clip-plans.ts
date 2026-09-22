// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What each position the call names gets made from. sampleFile pairs 1:1 with
// the positions, so MIDI-vs-audio is settled per clip; the timing params apply
// to every clip.

import { type Notation } from "#src/shared/notation.ts";
import { type MidiNote } from "#src/tools/clip/helpers/clip-results.ts";
import {
  type ListEntries,
  type PairLabels,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { parsePairedValues } from "#src/tools/shared/validation/lists/paired-values.ts";
import { prepareClipData } from "./clip-data-preparation.ts";
import {
  type ClipTimingContext,
  resolveClipTimingContext,
  type SongMeter,
} from "./clip-timing-context.ts";

/** Everything one position's clip is built from. */
export interface ClipPlan {
  /** Audio file for this clip, or null for a MIDI clip */
  sampleFile: string | null;
  /** The raw timeSignature for this clip, or null for the song's meter */
  timeSignature: string | null;
  /** The raw length for this clip, echoed back in its result */
  length: string | null;
  timing: ClipTimingContext;
  notes: MidiNote[];
  clipLength: number;
}

/** The call's params, as the caller sent them. */
export interface ClipPlanInputs {
  /** How many positions the call fills */
  count: number;
  song: SongMeter;
  sampleFile: string | null;
  timeSignature: string | null;
  start: string | null;
  length: string | null;
  firstStart: string | null;
  looping: boolean | null;
  notationString: string | null;
  transformString: string | null;
  notation: Notation | undefined;
}

/** The values one position is built from. */
interface ClipValues {
  sampleFile: string | null;
  timeSignature: string | null;
  start: string | null;
  length: string | null;
  firstStart: string | null;
}

const SAMPLE_FILE_LABELS: PairLabels = {
  param: "sampleFile",
  noun: "file",
  item: "position",
  shortfall: "got no clip",
};

/**
 * Work out what to build at each position the call names.
 *
 * Positions with the same sampleFile share one plan, so the notation is
 * interpreted once — and its duplicate-note warning is raised once, not once
 * per clip.
 * @param inputs - The call's params, as sent
 * @returns One plan per position, in the order the call named them
 * @throws Error when a list disagrees with the positions, or a value won't parse
 */
export function buildClipPlans(inputs: ClipPlanInputs): ClipPlan[] {
  const { count } = inputs;
  const sampleFiles = parsePairedValues(
    inputs.sampleFile,
    count,
    SAMPLE_FILE_LABELS,
  );
  const cache = new Map<string, ClipPlan>();

  return Array.from({ length: count }, (_unused, index) => {
    const values: ClipValues = {
      sampleFile: valueAt(inputs.sampleFile, index, sampleFiles),
      timeSignature: inputs.timeSignature,
      start: inputs.start,
      length: inputs.length,
      firstStart: inputs.firstStart,
    };
    const key = JSON.stringify(values);
    const cached = cache.get(key);

    if (cached != null) {
      return cached;
    }

    const plan = buildPlan(inputs, values);

    cache.set(key, plan);

    return plan;
  });
}

// --- Helpers below main exports ---

/**
 * One position's sampleFile.
 * @param value - The raw param, as the caller sent it
 * @param index - The position's place in the call
 * @param parsed - The split entries, or null when the value covers every one
 * @returns The value, or null when the call named none for this position
 */
function valueAt(
  value: string | null,
  index: number,
  parsed: ListEntries | null,
): string | null {
  return valueForIndex(value ?? undefined, index, parsed) ?? null;
}

/**
 * Resolve one position's timing and notes.
 * @param inputs - The call's params, as sent
 * @param values - What this position asked for
 * @returns The plan for that position
 */
function buildPlan(inputs: ClipPlanInputs, values: ClipValues): ClipPlan {
  const timing = resolveClipTimingContext(
    inputs.song,
    values.timeSignature,
    values.sampleFile,
    {
      start: values.start,
      firstStart: values.firstStart,
      length: values.length,
      looping: inputs.looping,
    },
  );
  const { notes, clipLength } = prepareClipData(
    values.sampleFile,
    inputs.notationString,
    timing.endBeats,
    timing.timeSigNumerator,
    timing.timeSigDenominator,
    inputs.notation,
    inputs.transformString,
  );

  return {
    sampleFile: values.sampleFile,
    timeSignature: values.timeSignature,
    length: values.length,
    timing,
    notes,
    clipLength,
  };
}

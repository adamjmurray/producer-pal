// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What each position the call names gets made from. sampleFile, timeSignature,
// start, length and firstStart pair 1:1 with the positions, so the meter, the
// region and even MIDI-vs-audio are settled per clip rather than per call.

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

/** The per-clip params, as the caller sent them, plus the call-wide ones. */
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

/** The per-clip values one position ended up with. */
interface ClipValues {
  sampleFile: string | null;
  timeSignature: string | null;
  start: string | null;
  length: string | null;
  firstStart: string | null;
}

const LABELS: Record<keyof ClipValues, PairLabels> = {
  sampleFile: {
    param: "sampleFile",
    noun: "file",
    item: "position",
    shortfall: "got no clip",
  },
  timeSignature: {
    param: "timeSignature",
    noun: "time signature",
    item: "position",
    shortfall: "used the song's meter",
  },
  start: {
    param: "start",
    noun: "position",
    item: "position",
    shortfall: "started where the notes do",
  },
  length: {
    param: "length",
    noun: "length",
    item: "position",
    shortfall: "were sized from their notes",
  },
  firstStart: {
    param: "firstStart",
    noun: "position",
    item: "position",
    shortfall: "kept the playback start they had",
  },
};

/**
 * Work out what to build at each position the call names.
 *
 * Positions asking for the same timing share one plan, so the notation is
 * interpreted once per distinct meter and region — and its duplicate-note
 * warning is raised once, not once per clip.
 * @param inputs - The per-clip params as sent, and the call-wide ones
 * @returns One plan per position, in the order the call named them
 * @throws Error when a list disagrees with the positions, or a value won't parse
 */
export function buildClipPlans(inputs: ClipPlanInputs): ClipPlan[] {
  const { count } = inputs;
  const lists = {
    sampleFile: pairedList(inputs.sampleFile, count, "sampleFile"),
    timeSignature: pairedList(inputs.timeSignature, count, "timeSignature"),
    start: pairedList(inputs.start, count, "start"),
    length: pairedList(inputs.length, count, "length"),
    firstStart: pairedList(inputs.firstStart, count, "firstStart"),
  };
  const cache = new Map<string, ClipPlan>();

  return Array.from({ length: count }, (_unused, index) => {
    const values: ClipValues = {
      sampleFile: valueAt(inputs.sampleFile, index, lists.sampleFile),
      timeSignature: valueAt(inputs.timeSignature, index, lists.timeSignature),
      start: valueAt(inputs.start, index, lists.start),
      length: valueAt(inputs.length, index, lists.length),
      firstStart: valueAt(inputs.firstStart, index, lists.firstStart),
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
 * Split one per-clip param against the positions.
 * @param value - The raw param, as the caller sent it
 * @param count - How many positions the call fills
 * @param param - Which param it is
 * @returns One entry per position, or null when the value covers every one
 */
function pairedList(
  value: string | null,
  count: number,
  param: keyof ClipValues,
): ListEntries | null {
  return parsePairedValues(value, count, LABELS[param]);
}

/**
 * One position's value for a per-clip param.
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
 * @param inputs - The per-clip params as sent, and the call-wide ones
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

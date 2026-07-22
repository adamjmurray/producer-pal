// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { type NoteEvent, type BarCopyNote } from "../../../types.ts";
import {
  validateBufferedState,
  type BufferState,
  type BarCopyResult,
} from "./barbeat-interpreter-buffer-helpers.ts";
import {
  copyBarToBar,
  copyNoteToDestination,
} from "./barbeat-interpreter-copy-bar-helpers.ts";

export interface BarCopyElement {
  destination: { bar?: number; range?: [number, number] };
  source: { bar?: number; range?: [number, number] } | "previous";
}

/**
 * Warn once when a bar copy found nothing to copy because its ENTIRE source is
 * empty. Sparse sources (some empty bars, some with notes) copy silently — a
 * partial gap is normal (e.g. held multi-bar chords tiled across a range).
 * Self-copy skips are reported separately, so a source that had content but was
 * fully self-skipped does not warn here (its bars still count as content).
 * @param sourceBars - Every source bar the copy referenced (contiguous, non-empty)
 * @param notesByBar - Notes by bar cache
 */
function warnIfSourceEntirelyEmpty(
  sourceBars: number[],
  notesByBar: Map<number, BarCopyNote[]>,
): void {
  const hasContent = sourceBars.some((bar) => {
    const notes = notesByBar.get(bar);

    return notes != null && notes.length > 0;
  });

  if (hasContent) {
    return;
  }

  const lo = Math.min(...sourceBars);
  const hi = Math.max(...sourceBars);

  console.warn(
    lo === hi
      ? `Bar ${lo} is empty, nothing to copy`
      : `Bars ${lo}-${hi} are empty, nothing to copy`,
  );
}

/**
 * Determine source bars for bar copy operation
 * @param element - Bar copy element
 * @returns Array of source bar numbers, or null if invalid
 */
function determineSourceBarsForCopy(element: BarCopyElement): number[] | null {
  if (element.source === "previous") {
    /* v8 ignore start -- caller guarantees destination.bar is defined */
    if (element.destination.bar == null) {
      return null;
    }
    /* v8 ignore stop */

    const previousBar = element.destination.bar - 1;

    if (previousBar <= 0) {
      console.warn("Cannot copy from previous bar when at bar 1 or earlier");

      return null;
    }

    return [previousBar];
  }

  if (element.source.bar !== undefined) {
    /* v8 ignore start -- parser guarantees bar > 0 */
    if (element.source.bar <= 0) {
      console.warn(`Cannot copy from bar ${element.source.bar} (no such bar)`);

      return null;
    }
    /* v8 ignore stop */

    return [element.source.bar];
  }

  if (element.source.range !== undefined) {
    const [start, end] = element.source.range;

    if (start <= 0 || end <= 0) {
      console.warn(
        `Cannot copy from range ${start}-${end} (invalid bar numbers)`,
      );

      return null;
    }

    if (start > end) {
      console.warn(`Invalid source range ${start}-${end} (start > end)`);

      return null;
    }

    const sourceBars: number[] = [];

    for (let bar = start; bar <= end; bar++) {
      sourceBars.push(bar);
    }

    return sourceBars;
  }

  return null;
}

/**
 * Handle multi-bar source range tiling to multiple destination bars
 * @param element - Bar copy element
 * @param destStart - Destination start bar
 * @param destEnd - Destination end bar
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator
 * @param notesByBar - Notes by bar cache
 * @param events - Output events array
 * @param bufferState - Buffer state
 * @returns Bar copy result
 */
function handleMultiBarSourceRangeCopy(
  element: BarCopyElement,
  destStart: number,
  destEnd: number,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
  notesByBar: Map<number, BarCopyNote[]>,
  events: NoteEvent[],
  bufferState: BufferState,
): BarCopyResult {
  // Source has range (validated by caller at line 347)
  const source = element.source as { range: [number, number] };
  const [sourceStart, sourceEnd] = source.range;

  // Validate source range
  if (sourceStart <= 0 || sourceEnd <= 0) {
    console.warn(
      `Invalid source range @${destStart}-${destEnd}=${sourceStart}-${sourceEnd} (invalid bar numbers)`,
    );

    return { currentTime: null };
  }

  if (sourceStart > sourceEnd) {
    console.warn(
      `Invalid source range @${destStart}-${destEnd}=${sourceStart}-${sourceEnd} (start > end)`,
    );

    return { currentTime: null };
  }

  validateBufferedState(bufferState, "bar copy");

  // Tile source range across destination
  const sourceCount = sourceEnd - sourceStart + 1;
  const barDuration =
    timeSigDenominator != null
      ? beatsPerBar * (4 / timeSigDenominator)
      : beatsPerBar;

  let destBar = destStart;
  let sourceOffset = 0;
  let copiedAny = false;

  while (destBar <= destEnd) {
    const sourceBar = sourceStart + (sourceOffset % sourceCount);

    // Skip copying a bar to itself
    if (sourceBar === destBar) {
      console.warn(`Skipping copy of bar ${sourceBar} to itself`);
      destBar++;
      sourceOffset++;
      continue;
    }

    // Get source notes
    const sourceNotes = notesByBar.get(sourceBar);

    if (sourceNotes == null || sourceNotes.length === 0) {
      // Skip silently; a sparse source is normal. If NOTHING copies, the
      // post-loop warnIfSourceEntirelyEmpty reports the fully-empty source.
      destBar++;
      sourceOffset++;
      continue;
    }

    // Copy and shift notes
    const destinationBarStart = (destBar - 1) * barDuration;

    for (const sourceNote of sourceNotes) {
      copyNoteToDestination(
        sourceNote,
        destBar,
        destinationBarStart,
        events,
        notesByBar,
      );
    }

    copiedAny = true;
    destBar++;
    sourceOffset++;
  }

  if (copiedAny) {
    return {
      currentTime: { bar: destStart, beat: 1 },
    };
  }

  const rangeBars: number[] = [];

  for (let bar = sourceStart; bar <= sourceEnd; bar++) {
    rangeBars.push(bar);
  }

  warnIfSourceEntirelyEmpty(rangeBars, notesByBar);

  return { currentTime: null };
}

/**
 * Handle bar copy with range destination (multiple destination bars from source bar(s))
 * @param element - Bar copy element
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator
 * @param notesByBar - Notes by bar cache
 * @param events - Output events array
 * @param bufferState - Buffer state
 * @returns Bar copy result
 */
export function handleBarCopyRangeDestination(
  element: BarCopyElement,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
  notesByBar: Map<number, BarCopyNote[]>,
  events: NoteEvent[],
  bufferState: BufferState,
): BarCopyResult {
  // Destination range is defined (validated by caller)
  const destRange = element.destination.range as [number, number];
  const [destStart, destEnd] = destRange;

  // Validate destination range
  if (destStart <= 0 || destEnd <= 0) {
    console.warn(
      `Invalid destination range @${destStart}-${destEnd}= (invalid bar numbers)`,
    );

    return { currentTime: null };
  }

  if (destStart > destEnd) {
    console.warn(
      `Invalid destination range @${destStart}-${destEnd}= (start > end)`,
    );

    return { currentTime: null };
  }

  // Handle multi-bar source range tiling
  if (element.source !== "previous" && element.source.range !== undefined) {
    return handleMultiBarSourceRangeCopy(
      element,
      destStart,
      destEnd,
      beatsPerBar,
      timeSigDenominator,
      notesByBar,
      events,
      bufferState,
    );
  }

  // Determine single source bar (must be "previous" or have bar property at this point)
  let sourceBar: number;

  if (element.source === "previous") {
    sourceBar = destStart - 1;

    if (sourceBar <= 0) {
      console.warn(
        `Cannot copy from previous bar when destination starts at bar ${destStart}`,
      );

      return { currentTime: null };
    }
  } else {
    // source.bar must be defined (source.range was handled above at line 341)
    sourceBar = element.source.bar as number;

    if (sourceBar <= 0) {
      console.warn(`Cannot copy from bar ${sourceBar} (no such bar)`);

      return { currentTime: null };
    }
  }

  validateBufferedState(bufferState, "bar copy");

  // Get source notes
  const sourceNotes = notesByBar.get(sourceBar);

  if (sourceNotes == null || sourceNotes.length === 0) {
    console.warn(`Bar ${sourceBar} is empty, nothing to copy`);

    return { currentTime: null };
  }

  // Copy to each destination bar
  const barDuration =
    timeSigDenominator != null
      ? beatsPerBar * (4 / timeSigDenominator)
      : beatsPerBar;

  let copiedAny = false;

  for (let destBar = destStart; destBar <= destEnd; destBar++) {
    // Skip copying a bar to itself
    if (sourceBar === destBar) {
      console.warn(`Skipping copy of bar ${sourceBar} to itself`);
      continue;
    }

    // Copy and shift notes
    const destinationBarStart = (destBar - 1) * barDuration;

    for (const sourceNote of sourceNotes) {
      copyNoteToDestination(
        sourceNote,
        destBar,
        destinationBarStart,
        events,
        notesByBar,
      );
    }

    copiedAny = true;
  }

  if (copiedAny) {
    return {
      currentTime: { bar: destStart, beat: 1 },
    };
  }

  return { currentTime: null };
}

/**
 * Handle bar copy with single destination bar (can have multiple source bars)
 * @param element - Bar copy element
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator
 * @param notesByBar - Notes by bar cache
 * @param events - Output events array
 * @param bufferState - Buffer state
 * @returns Bar copy result
 */
export function handleBarCopySingleDestination(
  element: BarCopyElement,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
  notesByBar: Map<number, BarCopyNote[]>,
  events: NoteEvent[],
  bufferState: BufferState,
): BarCopyResult {
  // Determine source bar(s)
  const sourceBars = determineSourceBarsForCopy(element);

  if (sourceBars == null) {
    return { currentTime: null };
  }

  validateBufferedState(bufferState, "bar copy");

  // Destination bar is defined (this function handles single destination, validated by caller)
  const destBar = element.destination.bar as number;

  // Copy notes from source bar(s) to destination
  const barDuration =
    timeSigDenominator != null
      ? beatsPerBar * (4 / timeSigDenominator)
      : beatsPerBar;

  let destinationBar = destBar;
  let copiedAny = false;

  for (const sourceBar of sourceBars) {
    const copySucceeded = copyBarToBar(
      sourceBar,
      destinationBar,
      notesByBar,
      events,
      barDuration,
    );

    if (copySucceeded) {
      copiedAny = true;
    }

    destinationBar++;
  }

  if (copiedAny) {
    return {
      currentTime: { bar: destBar, beat: 1 },
    };
  }

  warnIfSourceEntirelyEmpty(sourceBars, notesByBar);

  return { currentTime: null };
}

/**
 * Clear the copy buffer
 * @param notesByBar - Notes by bar cache to clear
 */
export function handleClearBuffer(
  notesByBar: Map<number, BarCopyNote[]>,
): void {
  notesByBar.clear();
}

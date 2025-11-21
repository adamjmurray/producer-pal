import * as console from "../../../../shared/v8-max-console.js";
import { validateBufferedState } from "./barbeat-interpreter-buffer-helpers.js";

/**
 * Copy a note to a destination bar
 * @param {object} sourceNote - Source note with pitch, relativeTime, duration, velocity, probability, velocity_deviation
 * @param {number} destBar - Destination bar number
 * @param {number} destinationBarStart - Destination bar start time in beats
 * @param {Array} events - Events array to push to
 * @param {Map} notesByBar - Map of bar numbers to arrays of notes
 */
export function copyNoteToDestination(
  sourceNote,
  destBar,
  destinationBarStart,
  events,
  notesByBar,
) {
  const copiedNote = {
    pitch: sourceNote.pitch,
    start_time: destinationBarStart + sourceNote.relativeTime,
    duration: sourceNote.duration,
    velocity: sourceNote.velocity,
    probability: sourceNote.probability,
    velocity_deviation: sourceNote.velocity_deviation,
  };
  events.push(copiedNote);

  // Track in notesByBar cache
  if (!notesByBar.has(destBar)) {
    notesByBar.set(destBar, []);
  }
  notesByBar.get(destBar).push({
    ...copiedNote,
    relativeTime: sourceNote.relativeTime,
    originalBar: destBar,
  });
}

/**
 * Copy notes from one source bar to one destination bar
 * @param {number} sourceBar - Source bar number
 * @param {number} destinationBar - Destination bar number
 * @param {Map} notesByBar - Notes by bar map
 * @param {Array} events - Events array to append to
 * @param {number} barDuration - Duration of one bar in beats
 * @returns {boolean} True if copy succeeded, false otherwise
 */
function copyBarToBar(
  sourceBar,
  destinationBar,
  notesByBar,
  events,
  barDuration,
) {
  // Reject self-copy to prevent infinite loop
  if (sourceBar === destinationBar) {
    console.error(
      `Warning: Cannot copy bar ${sourceBar} to itself (would cause infinite loop)`,
    );
    return false;
  }

  const sourceNotes = notesByBar.get(sourceBar);
  if (sourceNotes == null || sourceNotes.length === 0) {
    console.error(`Warning: Bar ${sourceBar} is empty, nothing to copy`);
    return false;
  }

  // Copy and shift notes
  const destinationBarStart = (destinationBar - 1) * barDuration;
  for (const sourceNote of sourceNotes) {
    copyNoteToDestination(
      sourceNote,
      destinationBar,
      destinationBarStart,
      events,
      notesByBar,
    );
  }

  return true;
}

/**
 * Determine source bars for bar copy operation
 * @param {object} element - AST element with source specification
 * @returns {number[]|null} Array of source bar numbers, or null on error
 */
function determineSourceBarsForCopy(element) {
  if (element.source === "previous") {
    const previousBar = element.destination.bar - 1;
    if (previousBar <= 0) {
      console.error(
        "Warning: Cannot copy from previous bar when at bar 1 or earlier",
      );
      return null;
    }
    return [previousBar];
  }

  if (element.source.bar !== undefined) {
    if (element.source.bar <= 0) {
      console.error(
        `Warning: Cannot copy from bar ${element.source.bar} (no such bar)`,
      );
      return null;
    }
    return [element.source.bar];
  }

  if (element.source.range !== undefined) {
    const [start, end] = element.source.range;
    if (start <= 0 || end <= 0) {
      console.error(
        `Warning: Cannot copy from range ${start}-${end} (invalid bar numbers)`,
      );
      return null;
    }
    if (start > end) {
      console.error(
        `Warning: Invalid source range ${start}-${end} (start > end)`,
      );
      return null;
    }
    const sourceBars = [];
    for (let bar = start; bar <= end; bar++) {
      sourceBars.push(bar);
    }
    return sourceBars;
  }

  return null;
}

/**
 * Handle multi-bar source range tiling to multiple destination bars
 * @param {object} element - AST element with source.range
 * @param {number} destStart - Destination range start
 * @param {number} destEnd - Destination range end
 * @param {number} beatsPerBar - Beats per bar
 * @param {number|null} timeSigDenominator - Time signature denominator
 * @param {Map} notesByBar - Notes by bar map
 * @param {Array} events - Events array to append to
 * @param {object} bufferState - Current buffer state for validation
 * @returns {object} { currentTime: {bar, beat}|null, hasExplicitBarNumber: boolean }
 */
function handleMultiBarSourceRangeCopy(
  element,
  destStart,
  destEnd,
  beatsPerBar,
  timeSigDenominator,
  notesByBar,
  events,
  bufferState,
) {
  const [sourceStart, sourceEnd] = element.source.range;

  // Validate source range
  if (sourceStart <= 0 || sourceEnd <= 0) {
    console.error(
      `Warning: Invalid source range @${destStart}-${destEnd}=${sourceStart}-${sourceEnd} (invalid bar numbers)`,
    );
    return { currentTime: null, hasExplicitBarNumber: false };
  }
  if (sourceStart > sourceEnd) {
    console.error(
      `Warning: Invalid source range @${destStart}-${destEnd}=${sourceStart}-${sourceEnd} (start > end)`,
    );
    return { currentTime: null, hasExplicitBarNumber: false };
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
      console.error(`Warning: Skipping copy of bar ${sourceBar} to itself`);
      destBar++;
      sourceOffset++;
      continue;
    }

    // Get source notes
    const sourceNotes = notesByBar.get(sourceBar);
    if (sourceNotes == null || sourceNotes.length === 0) {
      console.error(`Warning: Bar ${sourceBar} is empty, nothing to copy`);
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
      hasExplicitBarNumber: true,
    };
  }
  return { currentTime: null, hasExplicitBarNumber: false };
}

/**
 * Handle bar copy with range destination (multiple destination bars from source bar(s))
 * @param {object} element - AST element
 * @param {number} beatsPerBar - Beats per bar
 * @param {number|null} timeSigDenominator - Time signature denominator
 * @param {Map} notesByBar - Notes by bar map
 * @param {Array} events - Events array to append to
 * @param {object} bufferState - Current buffer state for validation
 * @returns {object} { currentTime: {bar, beat}|null, hasExplicitBarNumber: boolean }
 */
export function handleBarCopyRangeDestination(
  element,
  beatsPerBar,
  timeSigDenominator,
  notesByBar,
  events,
  bufferState,
) {
  const [destStart, destEnd] = element.destination.range;

  // Validate destination range
  if (destStart <= 0 || destEnd <= 0) {
    console.error(
      `Warning: Invalid destination range @${destStart}-${destEnd}= (invalid bar numbers)`,
    );
    return { currentTime: null, hasExplicitBarNumber: false };
  }
  if (destStart > destEnd) {
    console.error(
      `Warning: Invalid destination range @${destStart}-${destEnd}= (start > end)`,
    );
    return { currentTime: null, hasExplicitBarNumber: false };
  }

  // Handle multi-bar source range tiling
  if (element.source.range !== undefined) {
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

  // Determine single source bar
  let sourceBar;
  if (element.source === "previous") {
    sourceBar = destStart - 1;
    if (sourceBar <= 0) {
      console.error(
        `Warning: Cannot copy from previous bar when destination starts at bar ${destStart}`,
      );
      return { currentTime: null, hasExplicitBarNumber: false };
    }
  } else if (element.source.bar !== undefined) {
    sourceBar = element.source.bar;
    if (sourceBar <= 0) {
      console.error(`Warning: Cannot copy from bar ${sourceBar} (no such bar)`);
      return { currentTime: null, hasExplicitBarNumber: false };
    }
  }

  validateBufferedState(bufferState, "bar copy");

  // Get source notes
  const sourceNotes = notesByBar.get(sourceBar);
  if (sourceNotes == null || sourceNotes.length === 0) {
    console.error(`Warning: Bar ${sourceBar} is empty, nothing to copy`);
    return { currentTime: null, hasExplicitBarNumber: false };
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
      console.error(`Warning: Skipping copy of bar ${sourceBar} to itself`);
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
      hasExplicitBarNumber: true,
    };
  }
  return { currentTime: null, hasExplicitBarNumber: false };
}

/**
 * Handle bar copy with single destination bar (can have multiple source bars)
 * @param {object} element - AST element
 * @param {number} beatsPerBar - Beats per bar
 * @param {number|null} timeSigDenominator - Time signature denominator
 * @param {Map} notesByBar - Notes by bar map
 * @param {Array} events - Events array to append to
 * @param {object} bufferState - Current buffer state for validation
 * @returns {object} { currentTime: {bar, beat}|null, hasExplicitBarNumber: boolean }
 */
export function handleBarCopySingleDestination(
  element,
  beatsPerBar,
  timeSigDenominator,
  notesByBar,
  events,
  bufferState,
) {
  // Determine source bar(s)
  const sourceBars = determineSourceBarsForCopy(element);
  if (sourceBars === null) {
    return { currentTime: null, hasExplicitBarNumber: false };
  }

  validateBufferedState(bufferState, "bar copy");

  // Copy notes from source bar(s) to destination
  const barDuration =
    timeSigDenominator != null
      ? beatsPerBar * (4 / timeSigDenominator)
      : beatsPerBar;

  let destinationBar = element.destination.bar;
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
      currentTime: { bar: element.destination.bar, beat: 1 },
      hasExplicitBarNumber: true,
    };
  }
  return { currentTime: null, hasExplicitBarNumber: false };
}

/**
 * Clear the copy buffer
 * @param {Map} notesByBar - Notes by bar map to clear
 */
export function handleClearBuffer(notesByBar) {
  notesByBar.clear();
}

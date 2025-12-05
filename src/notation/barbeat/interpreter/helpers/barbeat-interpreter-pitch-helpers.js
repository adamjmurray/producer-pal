import * as console from "#src/shared/v8-max-console.js";

/**
 * Expand a repeat pattern into multiple beat positions
 * @param {object} pattern - Repeat pattern { start, times, step }
 * @param {number} currentBar - Current bar number (1-indexed)
 * @param {number} beatsPerBar - Musical beats per bar
 * @param {number} currentDuration - Current note duration (used when step is null)
 * @returns {Array<{bar: number, beat: number}>} Expanded positions
 */
export function expandRepeatPattern(
  pattern,
  currentBar,
  beatsPerBar,
  currentDuration,
) {
  const { start, times, step: stepValue } = pattern;
  const step = stepValue ?? currentDuration;
  if (times > 100) {
    console.error(
      `WARNING: Repeat pattern generates ${times} notes, which may be excessive`,
    );
  }
  const positions = [];

  // Convert starting position to absolute beats (0-based)
  const startBeats = (currentBar - 1) * beatsPerBar + (start - 1);
  for (let i = 0; i < times; i++) {
    const absoluteBeats = startBeats + i * step;
    const bar = Math.floor(absoluteBeats / beatsPerBar) + 1;
    const beat = (absoluteBeats % beatsPerBar) + 1;
    positions.push({ bar, beat });
  }
  return positions;
}

/**
 * Emit a single pitch at a position, creating note event and tracking for bar copy
 * @param {object} pitchState - Pitch state with velocity, duration, etc.
 * @param {object} position - Position with bar and beat
 * @param {number} beatsPerBar - Musical beats per bar
 * @param {number} timeSigDenominator - Time signature denominator (or null)
 * @param {Array} events - Events array to append to
 * @param {Map} notesByBar - Bar copy tracking map
 */
export function emitPitchAtPosition(
  pitchState,
  position,
  beatsPerBar,
  timeSigDenominator,
  events,
  notesByBar,
) {
  // Convert bar|beat to absolute beats
  const absoluteBeats = (position.bar - 1) * beatsPerBar + (position.beat - 1);
  // Convert to Ableton beats
  const abletonBeats =
    timeSigDenominator != null
      ? absoluteBeats * (4 / timeSigDenominator)
      : absoluteBeats;
  const abletonDuration =
    timeSigDenominator != null
      ? pitchState.duration * (4 / timeSigDenominator)
      : pitchState.duration;
  const noteEvent = {
    pitch: pitchState.pitch,
    start_time: abletonBeats,
    duration: abletonDuration,
    velocity: pitchState.velocity,
    probability: pitchState.probability,
    velocity_deviation: pitchState.velocityDeviation,
  };
  events.push(noteEvent);

  // Track for bar copy: calculate actual bar from note position
  const barDuration =
    timeSigDenominator != null
      ? beatsPerBar * (4 / timeSigDenominator)
      : beatsPerBar;
  const actualBar = Math.floor(abletonBeats / barDuration) + 1;
  const barStartAbletonBeats = (actualBar - 1) * barDuration;
  const relativeAbletonBeats = abletonBeats - barStartAbletonBeats;
  if (!notesByBar.has(actualBar)) {
    notesByBar.set(actualBar, []);
  }
  // Add to bar copy buffer (v0 notes will be filtered by applyV0Deletions at the end)
  notesByBar.get(actualBar).push({
    ...noteEvent,
    relativeTime: relativeAbletonBeats,
    originalBar: actualBar,
  });
}

/**
 * Emit all pitches at multiple positions
 * @param {Array} positions - Array of positions {bar, beat}
 * @param {Array} currentPitches - Array of pitch states to emit
 * @param {object} element - AST element (to check if bar is explicit)
 * @param {number} beatsPerBar - Musical beats per bar
 * @param {number} timeSigDenominator - Time signature denominator (or null)
 * @param {Array} events - Events array to append to
 * @param {Map} notesByBar - Bar copy tracking map
 * @returns {object} Updated currentTime and hasExplicitBarNumber flag
 */
export function emitPitchesAtPositions(
  positions,
  currentPitches,
  element,
  beatsPerBar,
  timeSigDenominator,
  events,
  notesByBar,
) {
  let currentTime = null;
  let hasExplicitBarNumber = false;
  for (const position of positions) {
    currentTime = position;
    if (element.bar !== null) {
      hasExplicitBarNumber = true;
    }
    for (const pitchState of currentPitches) {
      emitPitchAtPosition(
        pitchState,
        currentTime,
        beatsPerBar,
        timeSigDenominator,
        events,
        notesByBar,
      );
    }
  }
  return { currentTime, hasExplicitBarNumber };
}

/**
 * Calculate positions from time element
 * @param {object} element - Time position element with bar and beat
 * @param {object} state - Current interpreter state
 * @param {number} beatsPerBar - Beats per bar
 * @returns {Array} Array of position objects with bar and beat
 */
export function calculatePositions(element, state, beatsPerBar) {
  if (typeof element.beat === "object" && element.beat.start !== undefined) {
    const currentBar =
      element.bar === null
        ? state.hasExplicitBarNumber
          ? state.currentTime.bar
          : 1
        : element.bar;
    return expandRepeatPattern(
      element.beat,
      currentBar,
      beatsPerBar,
      state.currentDuration,
    );
  }

  const bar =
    element.bar === null
      ? state.hasExplicitBarNumber
        ? state.currentTime.bar
        : 1
      : element.bar;
  const beat = element.beat;
  return [{ bar, beat }];
}

/**
 * Handle pitch emission or warn if no pitches
 * @param {Array} positions - Array of positions to emit pitches at
 * @param {object} state - Current interpreter state
 * @param {object} element - Time position element
 * @param {number} beatsPerBar - Beats per bar
 * @param {number|null} timeSigDenominator - Time signature denominator
 * @param {Array} events - Events array
 * @param {Map} notesByBar - Notes by bar map
 */
export function handlePitchEmission(
  positions,
  state,
  element,
  beatsPerBar,
  timeSigDenominator,
  events,
  notesByBar,
) {
  if (state.currentPitches.length === 0) {
    if (positions.length === 1) {
      console.error(
        `Warning: Time position ${positions[0].bar}|${positions[0].beat} has no pitches`,
      );
    } else {
      console.error(
        `Warning: Time position has no pitches (first position: ${positions[0].bar}|${positions[0].beat})`,
      );
    }
    return;
  }

  if (state.stateChangedSinceLastPitch) {
    console.error(
      "Warning: state change after pitch(es) but before time position won't affect this group",
    );
  }

  const emitResult = emitPitchesAtPositions(
    positions,
    state.currentPitches,
    element,
    beatsPerBar,
    timeSigDenominator,
    events,
    notesByBar,
  );

  state.currentTime = emitResult.currentTime;
  if (emitResult.hasExplicitBarNumber) {
    state.hasExplicitBarNumber = true;
  }
  state.pitchesEmitted = true;
}

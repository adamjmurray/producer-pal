import * as console from "../../shared/v8-max-console";
import { applyV0Deletions } from "./barbeat-apply-v0-deletions.js";
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_DURATION,
  DEFAULT_PROBABILITY,
  DEFAULT_TIME,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
} from "./barbeat-config.js";
import {
  validateBufferedState,
  handleBarCopyRangeDestination,
  handleBarCopySingleDestination,
  handleClearBuffer,
} from "./barbeat-interpreter-helpers.js";
import * as parser from "./barbeat-parser.js";
import { barBeatDurationToMusicalBeats } from "./barbeat-time.js";

/**
 * Expand a repeat pattern into multiple beat positions
 * @param {Object} pattern - Repeat pattern { start, times, step }
 * @param {number} currentBar - Current bar number (1-indexed)
 * @param {number} beatsPerBar - Musical beats per bar
 * @param {number} currentDuration - Current note duration (used when step is null)
 * @returns {Array<{bar: number, beat: number}>} Expanded positions
 */
function expandRepeatPattern(
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
 * @param {Object} pitchState - Pitch state with velocity, duration, etc.
 * @param {Object} position - Position with bar and beat
 * @param {number} beatsPerBar - Musical beats per bar
 * @param {number} timeSigDenominator - Time signature denominator (or null)
 * @param {Array} events - Events array to append to
 * @param {Map} notesByBar - Bar copy tracking map
 */
function emitPitchAtPosition(
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
 * @param {Object} element - AST element (to check if bar is explicit)
 * @param {number} beatsPerBar - Musical beats per bar
 * @param {number} timeSigDenominator - Time signature denominator (or null)
 * @param {Array} events - Events array to append to
 * @param {Map} notesByBar - Bar copy tracking map
 * @returns {Object} Updated currentTime and hasExplicitBarNumber flag
 */
function emitPitchesAtPositions(
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
 * Convert bar|beat notation into note events
 * @param {string} barBeatExpression - bar|beat notation string
 * @param {Object} options - Options
 * @param {number} [options.beatsPerBar] - beats per bar (legacy, prefer timeSigNumerator/timeSigDenominator)
 * @param {number} [options.timeSigNumerator] - Time signature numerator
 * @param {number} [options.timeSigDenominator] - Time signature denominator
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>}
 */
export function interpretNotation(barBeatExpression, options = {}) {
  if (!barBeatExpression) {
    return [];
  }

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
  const beatsPerBar =
    timeSigNumerator ?? beatsPerBarOption ?? DEFAULT_BEATS_PER_BAR;

  try {
    const ast = parser.parse(barBeatExpression);

    // State variables
    let currentTime = DEFAULT_TIME;
    let currentVelocity = DEFAULT_VELOCITY;
    let currentDuration = DEFAULT_DURATION;
    let currentProbability = DEFAULT_PROBABILITY;
    let currentVelocityMin = null;
    let currentVelocityMax = null;
    let hasExplicitBarNumber = false;

    // New: Pitch buffering
    let currentPitches = [];
    let pitchGroupStarted = false;
    let pitchesEmitted = false; // Track if current pitches have been emitted at least once
    let stateChangedSinceLastPitch = false;
    let stateChangedAfterEmission = false; // Track wasted state changes before bar copy

    // Bar copy tracking: Map bar number -> array of note metadata
    const notesByBar = new Map();

    const events = [];

    for (const element of ast) {
      if (element.destination?.range !== undefined) {
        // BAR COPY RANGE - copy notes from single source to multiple destinations
        const result = handleBarCopyRangeDestination(
          element,
          beatsPerBar,
          timeSigDenominator,
          notesByBar,
          events,
          {
            currentPitches,
            pitchesEmitted,
            stateChangedSinceLastPitch,
            pitchGroupStarted,
            stateChangedAfterEmission,
          },
        );

        if (result.currentTime) {
          currentTime = result.currentTime;
          hasExplicitBarNumber = result.hasExplicitBarNumber;
        }

        // Clear pitch buffer (don't emit) and reset flags
        currentPitches = [];
        pitchGroupStarted = false;
        pitchesEmitted = false;
        stateChangedSinceLastPitch = false;
        stateChangedAfterEmission = false;
      } else if (element.destination?.bar !== undefined) {
        // BAR COPY - copy notes from source bar(s) to destination
        const result = handleBarCopySingleDestination(
          element,
          beatsPerBar,
          timeSigDenominator,
          notesByBar,
          events,
          {
            currentPitches,
            pitchesEmitted,
            stateChangedSinceLastPitch,
            pitchGroupStarted,
            stateChangedAfterEmission,
          },
        );

        if (result.currentTime) {
          currentTime = result.currentTime;
          hasExplicitBarNumber = result.hasExplicitBarNumber;
        }

        // Clear pitch buffer (don't emit) and reset flags
        currentPitches = [];
        pitchGroupStarted = false;
        pitchesEmitted = false;
        stateChangedSinceLastPitch = false;
        stateChangedAfterEmission = false;
      } else if (element.clearBuffer) {
        // CLEAR BUFFER - immediately clear the copy buffer
        validateBufferedState(
          {
            currentPitches,
            pitchesEmitted,
            stateChangedSinceLastPitch,
            pitchGroupStarted,
            stateChangedAfterEmission,
          },
          "@clear",
        );

        handleClearBuffer(notesByBar);

        // Clear pitch buffer (don't emit) and reset flags
        currentPitches = [];
        pitchGroupStarted = false;
        pitchesEmitted = false;
        stateChangedSinceLastPitch = false;
        stateChangedAfterEmission = false;
      } else if (element.bar !== undefined && element.beat !== undefined) {
        // TIME POSITION - emit notes

        // Determine positions to emit at (expand repeat patterns if needed)
        let positions;
        if (
          typeof element.beat === "object" &&
          element.beat.start !== undefined
        ) {
          // REPEAT PATTERN - expand to multiple positions
          const currentBar =
            element.bar === null
              ? hasExplicitBarNumber
                ? currentTime.bar
                : 1
              : element.bar;
          positions = expandRepeatPattern(
            element.beat,
            currentBar,
            beatsPerBar,
            currentDuration,
          );
        } else {
          // SINGLE POSITION
          const bar =
            element.bar === null
              ? hasExplicitBarNumber
                ? currentTime.bar
                : 1
              : element.bar;
          const beat = element.beat;
          positions = [{ bar, beat }];
        }

        // Warn once if no pitches to emit
        if (currentPitches.length === 0) {
          if (positions.length === 1) {
            console.error(
              `Warning: Time position ${positions[0].bar}|${positions[0].beat} has no pitches`,
            );
          } else {
            console.error(
              `Warning: Time position has no pitches (first position: ${positions[0].bar}|${positions[0].beat})`,
            );
          }
        } else {
          // Warn if state changed after pitch but before this time (only once)
          if (stateChangedSinceLastPitch) {
            console.error(
              "Warning: state change after pitch(es) but before time position won't affect this group",
            );
          }

          // Emit all buffered pitches at each position
          const emitResult = emitPitchesAtPositions(
            positions,
            currentPitches,
            element,
            beatsPerBar,
            timeSigDenominator,
            events,
            notesByBar,
          );
          currentTime = emitResult.currentTime;
          if (emitResult.hasExplicitBarNumber) {
            hasExplicitBarNumber = true;
          }

          // Mark pitches as emitted
          pitchesEmitted = true;
        }

        // Reset flags (but keep pitches for next time)
        pitchGroupStarted = false;
        stateChangedSinceLastPitch = false;
        stateChangedAfterEmission = false;
      } else if (element.pitch !== undefined) {
        // PITCH - buffer it

        // First pitch after a time position clears the buffer
        if (!pitchGroupStarted) {
          currentPitches = [];
          pitchGroupStarted = true;
          pitchesEmitted = false; // Reset emission flag for new pitch group
          stateChangedAfterEmission = false; // State will be captured with pitches
        }

        // Capture current state with this pitch
        let velocity, velocityDeviation;
        if (currentVelocityMin !== null && currentVelocityMax !== null) {
          velocity = currentVelocityMin;
          velocityDeviation = currentVelocityMax - currentVelocityMin;
        } else {
          velocity = currentVelocity ?? DEFAULT_VELOCITY;
          velocityDeviation = DEFAULT_VELOCITY_DEVIATION;
        }

        currentPitches.push({
          pitch: element.pitch,
          velocity: velocity,
          velocityDeviation: velocityDeviation,
          duration: currentDuration,
          probability: currentProbability,
        });

        // Pitch consumed the state change
        stateChangedSinceLastPitch = false;
      } else if (element.velocity !== undefined) {
        // STATE UPDATE - velocity (single)

        currentVelocity = element.velocity;
        currentVelocityMin = null;
        currentVelocityMax = null;

        // Track if state changed after pitch in current group
        if (pitchGroupStarted && currentPitches.length > 0) {
          stateChangedSinceLastPitch = true;
        }

        // Update buffered pitches if after time position
        if (!pitchGroupStarted && currentPitches.length > 0) {
          for (const pitchState of currentPitches) {
            pitchState.velocity = element.velocity;
            pitchState.velocityDeviation = DEFAULT_VELOCITY_DEVIATION;
          }
          // State changes applied to buffered pitches could be wasted if bar copy occurs
          stateChangedAfterEmission = true;
        }

        // Track wasted state changes (after emission, before pitches)
        if (!pitchGroupStarted && currentPitches.length === 0) {
          stateChangedAfterEmission = true;
        }
      } else if (
        element.velocityMin !== undefined &&
        element.velocityMax !== undefined
      ) {
        // STATE UPDATE - velocity (range)

        currentVelocityMin = element.velocityMin;
        currentVelocityMax = element.velocityMax;
        currentVelocity = null;

        // Track if state changed after pitch in current group
        if (pitchGroupStarted && currentPitches.length > 0) {
          stateChangedSinceLastPitch = true;
        }

        // Update buffered pitches if after time position
        if (!pitchGroupStarted && currentPitches.length > 0) {
          for (const pitchState of currentPitches) {
            pitchState.velocity = element.velocityMin;
            pitchState.velocityDeviation =
              element.velocityMax - element.velocityMin;
          }
          // State changes applied to buffered pitches could be wasted if bar copy occurs
          stateChangedAfterEmission = true;
        }

        // Track wasted state changes (after emission, before pitches)
        if (!pitchGroupStarted && currentPitches.length === 0) {
          stateChangedAfterEmission = true;
        }
      } else if (element.duration !== undefined) {
        // STATE UPDATE - duration

        // Handle both string (bar:beat) and number (beat-only) formats
        if (typeof element.duration === "string") {
          currentDuration = barBeatDurationToMusicalBeats(
            element.duration,
            timeSigNumerator,
            timeSigDenominator,
          );
        } else {
          currentDuration = element.duration; // Already in musical beats
        }

        // Track if state changed after pitch in current group
        if (pitchGroupStarted && currentPitches.length > 0) {
          stateChangedSinceLastPitch = true;
        }

        // Update buffered pitches if after time position
        if (!pitchGroupStarted && currentPitches.length > 0) {
          for (const pitchState of currentPitches) {
            pitchState.duration = currentDuration; // Use converted value
          }
          // State changes applied to buffered pitches could be wasted if bar copy occurs
          stateChangedAfterEmission = true;
        }

        // Track wasted state changes (after emission, before pitches)
        if (!pitchGroupStarted && currentPitches.length === 0) {
          stateChangedAfterEmission = true;
        }
      } else if (element.probability !== undefined) {
        // STATE UPDATE - probability

        currentProbability = element.probability;

        // Track if state changed after pitch in current group
        if (pitchGroupStarted && currentPitches.length > 0) {
          stateChangedSinceLastPitch = true;
        }

        // Update buffered pitches if after time position
        if (!pitchGroupStarted && currentPitches.length > 0) {
          for (const pitchState of currentPitches) {
            pitchState.probability = element.probability;
          }
          // State changes applied to buffered pitches could be wasted if bar copy occurs
          stateChangedAfterEmission = true;
        }

        // Track wasted state changes (after emission, before pitches)
        if (!pitchGroupStarted && currentPitches.length === 0) {
          stateChangedAfterEmission = true;
        }
      }
    }

    // Warn if pitches buffered but never emitted
    if (currentPitches.length > 0 && !pitchesEmitted) {
      console.error(
        `Warning: ${currentPitches.length} pitch(es) buffered but no time position to emit them`,
      );
    }

    // Apply v0 deletions as final post-processing step
    return applyV0Deletions(events);
  } catch (error) {
    if (error.name === "SyntaxError") {
      const location = error.location || {};
      const position = location.start
        ? `at position ${location.start.offset} (line ${location.start.line}, column ${location.start.column})`
        : "at unknown position";

      throw new Error(`bar|beat syntax error ${position}: ${error.message}`);
    }
    throw error;
  }
}

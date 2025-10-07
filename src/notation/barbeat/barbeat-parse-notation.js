import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_DURATION,
  DEFAULT_PROBABILITY,
  DEFAULT_TIME,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
} from "./barbeat-config.js";
import * as parser from "./barbeat-parser.js";

/**
 * Convert bar|beat notation to note events
 * @param {string} barBeatExpression - bar|beat notation string
 * @param {Object} options - Options
 * @param {number} [options.beatsPerBar] - beats per bar (legacy, prefer timeSigNumerator/timeSigDenominator)
 * @param {number} [options.timeSigNumerator] - Time signature numerator
 * @param {number} [options.timeSigDenominator] - Time signature denominator
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>}
 */
export function parseNotation(barBeatExpression, options = {}) {
  if (!barBeatExpression) return [];

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
    let stateChangedSinceLastPitch = false;
    let stateChangedAfterEmission = false; // Track wasted state changes before bar copy

    // Bar copy tracking: Map bar number -> array of note metadata
    const notesByBar = new Map();

    const events = [];

    for (const element of ast) {
      if (element.barCopy !== undefined) {
        // BAR COPY - copy notes from source bar(s) to destination

        // Determine source bar(s)
        let sourceBars;
        if (element.sourcePrevious) {
          const previousBar = element.barCopy - 1;
          if (previousBar <= 0) {
            console.error(
              "Warning: Cannot copy from previous bar when at bar 1 or earlier",
            );
            continue;
          }
          sourceBars = [previousBar];
        } else if (element.sourceBar !== undefined) {
          if (element.sourceBar <= 0) {
            console.error(
              `Warning: Cannot copy from bar ${element.sourceBar} (no such bar)`,
            );
            continue;
          }
          sourceBars = [element.sourceBar];
        } else if (element.sourceRange !== undefined) {
          const [start, end] = element.sourceRange;
          if (start <= 0 || end <= 0) {
            console.error(
              `Warning: Cannot copy from range ${start}-${end} (invalid bar numbers)`,
            );
            continue;
          }
          if (start > end) {
            console.error(
              `Warning: Invalid source range ${start}-${end} (start > end)`,
            );
            continue;
          }
          sourceBars = [];
          for (let bar = start; bar <= end; bar++) {
            sourceBars.push(bar);
          }
        }

        // Warn if pitches or state buffered but not emitted
        if (currentPitches.length > 0) {
          console.error(
            `Warning: ${currentPitches.length} pitch(es) buffered but not emitted before bar copy`,
          );
        }
        if (
          (stateChangedSinceLastPitch && pitchGroupStarted) ||
          stateChangedAfterEmission
        ) {
          console.error(
            "Warning: state change won't affect anything before bar copy",
          );
        }

        // Copy notes from source bar(s) to destination
        const barDuration =
          timeSigDenominator != null
            ? beatsPerBar * (4 / timeSigDenominator)
            : beatsPerBar;

        let destinationBar = element.barCopy;
        let copiedAny = false;

        for (const sourceBar of sourceBars) {
          // Reject self-copy to prevent infinite loop
          if (sourceBar === destinationBar) {
            console.error(
              `Warning: Cannot copy bar ${sourceBar} to itself (would cause infinite loop)`,
            );
            destinationBar++;
            continue;
          }

          const sourceNotes = notesByBar.get(sourceBar);

          if (sourceNotes == null || sourceNotes.length === 0) {
            console.error(
              `Warning: Bar ${sourceBar} is empty, nothing to copy`,
            );
            destinationBar++;
            continue;
          }

          // Copy and shift notes
          const destinationBarStart = (destinationBar - 1) * barDuration;

          for (const sourceNote of sourceNotes) {
            const copiedNote = {
              pitch: sourceNote.pitch,
              start_time: destinationBarStart + sourceNote.relativeTime,
              duration: sourceNote.duration,
              velocity: sourceNote.velocity,
              probability: sourceNote.probability,
              velocity_deviation: sourceNote.velocity_deviation,
            };

            events.push(copiedNote);

            // Track copied note in destination bar
            if (!notesByBar.has(destinationBar)) {
              notesByBar.set(destinationBar, []);
            }
            notesByBar.get(destinationBar).push({
              ...copiedNote,
              relativeTime: sourceNote.relativeTime,
              originalBar: destinationBar,
            });
          }

          copiedAny = true;
          destinationBar++;
        }

        if (copiedAny) {
          // Update current time to start of first destination bar
          currentTime = { bar: element.barCopy, beat: 1 };
          hasExplicitBarNumber = true;
        }

        // Clear pitch buffer (don't emit) and reset flags
        currentPitches = [];
        pitchGroupStarted = false;
        stateChangedSinceLastPitch = false;
        stateChangedAfterEmission = false;
      } else if (element.bar !== undefined && element.beat !== undefined) {
        // TIME POSITION - emit notes

        // Update current time
        if (element.bar === null) {
          if (!hasExplicitBarNumber) {
            currentTime = { bar: 1, beat: element.beat };
          } else {
            currentTime = { bar: currentTime.bar, beat: element.beat };
          }
        } else {
          currentTime = { bar: element.bar, beat: element.beat };
          hasExplicitBarNumber = true;
        }

        // Warn if no pitches to emit
        if (currentPitches.length === 0) {
          console.error(
            `Warning: Time position ${currentTime.bar}|${currentTime.beat} has no pitches`,
          );
        } else {
          // Warn if state changed after pitch but before this time
          if (stateChangedSinceLastPitch) {
            console.error(
              "Warning: state change after pitch(es) but before time position won't affect this group",
            );
          }

          // Emit all buffered pitches at this time
          for (const pitchState of currentPitches) {
            // Convert bar|beat to absolute beats
            const absoluteBeats =
              (currentTime.bar - 1) * beatsPerBar + (currentTime.beat - 1);

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

            // Track for bar copy: store metadata including relative time
            if (!notesByBar.has(currentTime.bar)) {
              notesByBar.set(currentTime.bar, []);
            }
            const relativeBeats = currentTime.beat - 1;
            const relativeAbletonBeats =
              timeSigDenominator != null
                ? relativeBeats * (4 / timeSigDenominator)
                : relativeBeats;

            notesByBar.get(currentTime.bar).push({
              ...noteEvent,
              relativeTime: relativeAbletonBeats,
              originalBar: currentTime.bar,
            });
          }
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
        currentDuration = element.duration;

        // Track if state changed after pitch in current group
        if (pitchGroupStarted && currentPitches.length > 0) {
          stateChangedSinceLastPitch = true;
        }

        // Update buffered pitches if after time position
        if (!pitchGroupStarted && currentPitches.length > 0) {
          for (const pitchState of currentPitches) {
            pitchState.duration = element.duration;
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
    if (currentPitches.length > 0) {
      console.error(
        `Warning: ${currentPitches.length} pitch(es) buffered but no time position to emit them`,
      );
    }

    return events;
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

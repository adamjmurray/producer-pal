// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Writing an evaluated transform value onto a note: the per-parameter clamping
 * and beat conversion, and the deferred write a waveform assignment uses so a
 * flat LFO can be dropped before it lands.
 */

import { type NoteEvent } from "../../types.ts";
import { type TransformAssignment } from "../parser/transform-parser.ts";
import { isFlatWaveform } from "./transform-flat-waveform-helpers.ts";

/** A waveform value evaluated but not yet written to its note. */
export interface DeferredWrite {
  note: NoteEvent;
  index: number;
  value: number;
}

/**
 * Write the values a waveform assignment held back — unless it came out flat,
 * in which case the whole assignment is dropped and none of its notes count as
 * transformed.
 *
 * @param waveformName - Waveform the assignment used, for the warning
 * @param deferred - Values evaluated but not yet applied, one per note
 * @param assignment - The assignment being applied
 * @param timeSigDenominator - Time signature denominator for beat conversion
 * @param transformedIndices - Set collecting the notes this transform changed
 */
export function commitWaveformWrites(
  waveformName: string,
  deferred: DeferredWrite[],
  assignment: TransformAssignment,
  timeSigDenominator: number,
  transformedIndices: Set<number>,
): void {
  if (
    isFlatWaveform(
      waveformName,
      deferred.map((write) => write.value),
    )
  ) {
    return;
  }

  for (const write of deferred) {
    applyTransformResult(
      write.note,
      assignment.parameter,
      assignment.operator,
      write.value,
      timeSigDenominator,
    );

    transformedIndices.add(write.index);
  }
}

/**
 * Apply a single transform result to a note in-place.
 * Handles clamping and conversion between musical and Ableton beats.
 * @param note - Note to modify
 * @param parameter - Transform parameter name
 * @param operator - Transform operator ("set" or "add")
 * @param value - Evaluated expression value (in musical beats for timing/duration)
 * @param timeSigDenominator - Time signature denominator for beat conversion
 */
export function applyTransformResult(
  note: NoteEvent,
  parameter: string,
  operator: "add" | "set",
  value: number,
  timeSigDenominator: number,
): void {
  switch (parameter) {
    case "velocity":
      note.velocity =
        operator === "set"
          ? Math.min(127, value)
          : Math.min(127, note.velocity + value);
      break;

    case "timing": {
      const tv = value * (4 / timeSigDenominator);

      note.start_time = operator === "set" ? tv : note.start_time + tv;
      break;
    }

    case "duration": {
      const dv = value * (4 / timeSigDenominator);

      note.duration = operator === "set" ? dv : note.duration + dv;
      break;
    }

    case "probability":
      note.probability = Math.max(
        0,
        Math.min(
          1,
          operator === "set" ? value : (note.probability ?? 1) + value,
        ),
      );
      break;

    case "deviation":
      note.velocity_deviation = Math.max(
        -127,
        Math.min(
          127,
          operator === "set" ? value : (note.velocity_deviation ?? 0) + value,
        ),
      );
      break;

    case "pitch": {
      const raw = operator === "set" ? value : note.pitch + value;

      note.pitch = Math.max(0, Math.min(127, Math.round(raw)));
      break;
    }
  }
}

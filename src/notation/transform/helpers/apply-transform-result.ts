// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Writing an evaluated transform value onto a note: the per-parameter clamping
 * and beat conversion.
 */

import { clampMidi } from "#src/shared/pitch.ts";
import { type NoteEvent } from "../../types.ts";

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

      note.pitch = clampMidi(Math.round(raw));
      break;
    }
  }
}

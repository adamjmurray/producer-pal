// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Turning a point's display value, `(-6 dB)`, into the raw value Live stores.
// It reads the value the way ppal-update-device does, and only asks the
// parameter what it displays: nothing is written here.

import {
  type EnvelopeNotationPoint,
  type WrittenEnvelopePoint,
} from "#src/notation/barbeat/envelope/envelope-notation.ts";
import { envelopeParameter } from "#src/tools/clip/read/helpers/clip-envelopes.ts";
import { rawValueForParam } from "#src/tools/device/update/helpers/params/param-value-interpretation.ts";
import { normalizeParamValue } from "#src/tools/device/update/update-device-param-parser.ts";
import { trimmedParamName } from "#src/tools/shared/device/helpers/param-reading.ts";
import { strForValue } from "#src/tools/shared/device/helpers/params/param-label-parsing.ts";
import { type EnvelopeTrack, trackObject } from "../envelope-track.ts";
import { type EnvelopeTarget } from "../targets/envelope-targets.ts";

/** The tail a Live path adds to a device's own path to name one of its params. */
const PARAMETER_TAIL = / parameters \d+$/;

/**
 * Whether any point gives a display value in place of a raw one.
 * @param points - The parsed notation
 * @returns True when one does
 */
export function hasDisplayValues(
  points: readonly WrittenEnvelopePoint[],
): boolean {
  return points.some((point) => "display" in point);
}

/** A line's points with raw values, and a note naming any value clamped. */
export interface RawPoints {
  points: EnvelopeNotationPoint[];
  clamped?: string;
}

/**
 * Give every point its raw value, converting the ones written as a display
 * value. A ramp between two converted points is still straight in raw values,
 * so it bends wherever the parameter's display does. A display value past the
 * range takes the nearest end, as ppal-update-device does.
 * @param points - The parsed notation
 * @param target - The parameter the line writes
 * @param track - The track the clip sits on
 * @returns The points, all with raw values, and any clamp note
 * @throws Error saying why a display value stands for no raw value
 */
export function rawPointValues(
  points: readonly WrittenEnvelopePoint[],
  target: EnvelopeTarget,
  track: EnvelopeTrack,
): RawPoints {
  if (!hasDisplayValues(points)) {
    return { points: points as EnvelopeNotationPoint[] };
  }

  const param = envelopeParameter(
    trackObject(track),
    target.device,
    target.parameter,
  );

  if (param?.exists() !== true) {
    throw new Error(
      "not written: the parameter can't be read to convert a display value; write raw values",
    );
  }

  const deviceName = deviceNameOf(param);
  const paramName = trimmedParamName(param);
  // An envelope often repeats a value, and a search is ~60 reads of the param.
  const converted = new Map<string, number>();
  const clamped: string[] = [];

  const raw = points.map((point) => {
    if (!("display" in point)) {
      return point;
    }

    const { display, ...rest } = point;
    let value = converted.get(display);

    if (value == null) {
      const found = rawValue(param, display, deviceName, paramName);

      value = found.raw;
      converted.set(display, value);

      if (found.clamped) {
        clamped.push(clampedValue(display, strForValue(param, value)));
      }
    }

    return { ...rest, value };
  });

  return withClampNote(raw, clamped);
}

/**
 * Say which display values were past the range and what was written instead.
 * @param display - The display value as written
 * @param written - What the param displays at the value written
 * @returns One value for the note
 */
export function clampedValue(display: string, written: string): string {
  return `(${display}) as ${written.trim()}`;
}

/**
 * Put the points beside one note naming every clamped value, if any.
 * @param points - The points, all with raw values
 * @param clamped - Each clamped value, from clampedValue
 * @returns The points and the note
 */
export function withClampNote(
  points: EnvelopeNotationPoint[],
  clamped: readonly string[],
): RawPoints {
  return clamped.length === 0
    ? { points }
    : { points, clamped: `past the range, wrote ${clamped.join(", ")}` };
}

// --- Helpers below main exports ---

/**
 * Convert one display value.
 * @param param - The parameter
 * @param display - The display value, as written between the parentheses
 * @param deviceName - The device's class_display_name, if it is a device's
 * @param paramName - The parameter's name
 * @returns The raw value, and whether it was clamped to the range
 * @throws Error saying why it stands for no raw value
 */
function rawValue(
  param: LiveAPI,
  display: string,
  deviceName: string | undefined,
  paramName: string,
): { raw: number; clamped: boolean } {
  const found = rawValueForParam(
    param,
    normalizeParamValue(display, deviceName, paramName),
    display,
    deviceName,
  );

  if ("reason" in found) {
    throw new Error(`not written: ${found.reason}`);
  }

  // A display value only ever changes on the way in by a clamp to the range.
  return { raw: found.raw, clamped: found.report?.changed != null };
}

/**
 * The name of the device a parameter belongs to, for its recorded units.
 * @param param - The parameter
 * @returns The device's class_display_name, or undefined for a mixer parameter
 */
function deviceNameOf(param: LiveAPI): string | undefined {
  if (!PARAMETER_TAIL.test(param.path)) {
    return undefined;
  }

  return LiveAPI.from(param.path.replace(PARAMETER_TAIL, "")).getProperty(
    "class_display_name",
  ) as string | undefined;
}

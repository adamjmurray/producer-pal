// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Turning a point's display value, `(-6 dB)`, into the 0-1 value a hosted
// plug-in's param takes. Only the plug-in knows what it displays, so its
// wrapper searches for each value and then puts the param back.

import { probePluginHost } from "#src/live-api-adapter/protocols/plugin-host-v8-protocol.ts";
import {
  type EnvelopeNotationPoint,
  type WrittenEnvelopePoint,
} from "#src/notation/barbeat/envelope/envelope-notation.ts";
import { hostedValueRequest } from "#src/tools/device/update/helpers/call/hosted-params.ts";
import { wrapperRefusal } from "#src/tools/shared/device/helpers/params/hosted-automation-slots.ts";
import { hostedParamId } from "#src/tools/shared/device/helpers/params/hosted-plugin-reading.ts";
import {
  clampedValue,
  type RawPoints,
  withClampNote,
} from "../points/display-point-values.ts";
import { type HostedTarget } from "./hosted-envelope-target.ts";

/** What the wrapper answers for one display value. */
type FoundValue =
  | { value: number; display: string; outside?: true }
  | { error: string };

/**
 * Give every point its raw value, converting the ones written as a display
 * value. A ramp between two converted points is still straight in raw values.
 * A display value past the range takes the nearest end.
 * @param points - The parsed notation
 * @param hosted - The hosted param the line writes
 * @returns The points, all with raw values, and any clamp note
 * @throws Error saying why a display value stands for no raw value
 */
export function hostedRawPointValues(
  points: readonly WrittenEnvelopePoint[],
  hosted: Pick<HostedTarget, "deviceId" | "index">,
): RawPoints {
  const displays = [
    ...new Set(
      points.flatMap((point) => ("display" in point ? [point.display] : [])),
    ),
  ];

  if (displays.length === 0) {
    return { points: points as EnvelopeNotationPoint[] };
  }

  const { raw, clamped } = findRawValues(displays, hosted);
  const written = points.map((point) => {
    if (!("display" in point)) {
      return point;
    }

    const { display, ...rest } = point;

    return { ...rest, value: raw.get(display) as number };
  });

  return withClampNote(written, clamped);
}

// --- Helpers below main exports ---

/**
 * Ask the wrapper where its param shows each display value.
 * @param displays - The display values, each once
 * @param hosted - The hosted param
 * @returns The raw value of each display value, and each one clamped
 * @throws Error saying why one stands for no raw value
 */
function findRawValues(
  displays: string[],
  hosted: Pick<HostedTarget, "deviceId" | "index">,
): { raw: Map<string, number>; clamped: string[] } {
  const id = hostedParamId(hosted.index);
  const reply = probePluginHost(hosted.deviceId, "find", {
    index: hosted.index,
    values: displays.map((display) => hostedValueRequest(display, id)),
  });
  const found = (reply?.values ?? []) as FoundValue[];

  if (reply?.success !== true || found.length !== displays.length) {
    throw new Error(
      `not written: ${wrapperRefusal(hosted.deviceId, reply?.error, "find")}`,
    );
  }

  const raw = new Map<string, number>();
  const clamped: string[] = [];

  for (const [i, display] of displays.entries()) {
    const value = found[i] as FoundValue;

    if ("error" in value) {
      throw new Error(`not written: ${value.error}`);
    }

    // The search lands on the nearest end.
    if (value.outside) {
      clamped.push(clampedValue(display, value.display));
    }

    raw.set(display, value.value);
  }

  return { raw, clamped };
}

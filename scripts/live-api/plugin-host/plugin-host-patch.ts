// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

export type Json = Record<string, unknown>;

// Node has these (JSON.parse source text access); TypeScript's lib doesn't yet.
export const RawJson = JSON as unknown as {
  parse: (
    text: string,
    reviver: (
      key: string,
      value: unknown,
      context: { source: string },
    ) => unknown,
  ) => unknown;
  rawJSON: (text: string) => unknown;
};

// A live.dial's 0-1 float range. Max reads a bare 0 or 1 as an integer, and
// the default unit style is Int, so either makes the dial snap from 0 to 1.
export const FLOAT_RANGE: Json = {
  parameter_type: 0,
  parameter_mmin: RawJson.rawJSON("0.0"),
  parameter_mmax: RawJson.rawJSON("1.0"),
  parameter_unitstyle: 1,
};

export interface Patchline {
  patchline: { source: [string, number]; destination: [string, number] };
}

/**
 * A cord between two boxes of the plug-in host patch.
 *
 * @param from - Source box id
 * @param to - Destination box id (its first inlet)
 * @param outlet - Source outlet
 * @returns The patchline
 */
export function patchCord(from: string, to: string, outlet = 0): Patchline {
  return { patchline: { source: [from, outlet], destination: [to, 0] } };
}

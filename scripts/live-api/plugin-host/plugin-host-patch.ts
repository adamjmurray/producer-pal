// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

export type Json = Record<string, unknown>;

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

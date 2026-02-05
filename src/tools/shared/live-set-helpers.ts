// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

/**
 * Parse song time signature from live_set
 * @returns Time signature components
 */
export function parseSongTimeSignature(): TimeSignature {
  const liveSet = LiveAPI.from("live_set");

  return {
    numerator: liveSet.getProperty("signature_numerator") as number,
    denominator: liveSet.getProperty("signature_denominator") as number,
  };
}

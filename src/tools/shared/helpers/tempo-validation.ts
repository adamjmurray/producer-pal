// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { MAX_TEMPO, MIN_TEMPO, TEMPO_REFUSAL } from "#src/tools/constants.ts";

/**
 * Refuse a tempo Live can't hold, before anything is written.
 *
 * One value for the whole call, so checking it per scene fired the same
 * message once per scene and still let the names and colors land. Mirrors the
 * up-front parseTimeSignature call beside it.
 * @param tempo - Tempo in BPM, if given
 * @param disableValue - Value meaning "turn tempo off", exempt from the range
 *   check. Scenes have one; the live set does not.
 */
export function validateTempo(
  tempo: number | null | undefined,
  disableValue?: number,
): void {
  if (tempo == null || tempo === disableValue) {
    return;
  }

  if (tempo < MIN_TEMPO || tempo > MAX_TEMPO) {
    const disableHint =
      disableValue == null ? "" : ` Pass ${disableValue} to disable it.`;

    throw new Error(`${TEMPO_REFUSAL}${disableHint}`);
  }
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ChainMixerApplied,
  type ChainMixerParams,
} from "#src/tools/shared/device/helpers/chain-mixer/chain-mixer.ts";
import {
  type PublishedValue,
  differsAtPublishedResolution,
  readBackDetail,
} from "#src/tools/shared/helpers/read-back-comparison.ts";
import { roundGainDb, roundPan } from "#src/tools/shared/helpers/rounding.ts";

/** What a chain mixer write has to say, once the values that landed drop out. */
export interface ChainMixerReport extends ChainMixerApplied {
  /** Why a value isn't the one asked for */
  detail?: string;
}

/**
 * Keep only what didn't land as asked. `applyChainMixer` reads every value back
 * because a carry onto another chain needs them all; a result reports the ones
 * Live didn't keep, since the rest say nothing the caller doesn't know.
 * @param applied - What the write landed, read back off the chain
 * @param params - The mixer values the call asked for
 * @returns The mixer fields for the chain's result entry
 */
export function chainMixerReport(
  applied: ChainMixerApplied,
  params: ChainMixerParams,
): ChainMixerReport {
  const report: ChainMixerReport = {};
  const changed: string[] = [];
  const gainDb = changedValue(params.gainDb, applied.gainDb, roundGainDb);
  const pan = changedValue(params.pan, applied.pan, roundPan);

  if (gainDb != null) {
    report.gainDb = gainDb;
    changed.push("gainDb");
  }

  if (pan != null) {
    report.pan = pan;
    changed.push("pan");
  }

  // A send marks its own level as one Live didn't keep.
  const sends = (applied.sends ?? []).filter((send) => send.detail != null);

  if (sends.length > 0) {
    report.sends = sends;
  }

  const detail = readBackDetail(changed);

  if (detail != null) {
    report.detail = detail;
  }

  return report;
}

/**
 * The value to report for one mixer param: the read-back when it isn't the
 * value asked for, otherwise nothing.
 * @param requested - The value the call asked for, if it asked
 * @param landed - What the chain reads now, if anything was written
 * @param round - Rounds to the resolution reads publish
 * @returns The value to report, or undefined when there is nothing to say
 */
function changedValue(
  requested: number | undefined,
  landed: PublishedValue | undefined,
  round: (value: number) => number,
): PublishedValue | undefined {
  return requested != null &&
    landed != null &&
    differsAtPublishedResolution(requested, landed, round)
    ? landed
    : undefined;
}

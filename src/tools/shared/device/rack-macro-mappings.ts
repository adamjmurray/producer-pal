// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Which of a rack's macros are mapped. Max's Live API only says whether the rack
// has any mapping; the Producer Pal remote script can say which.

import {
  MAX_RACKS_PER_CALL,
  RACK_MACROS_ROUTE,
  type RackMacrosResult,
} from "#src/tools/shared/remote-script/rack-macros-contract.ts";
import {
  type DeviceBatchRoute,
  askAboutDevices,
} from "#src/tools/shared/remote-script/device-batch-route.ts";

/** What the remote script said about one rack's macros. */
export type MappedMacros =
  /** The mapped macros' numbers, 1-based, hidden ones included */
  | { mapped: number[] }
  /** Why they couldn't be read: the remote script said so, or didn't answer */
  | { unreadable: string };

const RACK_MACROS: DeviceBatchRoute<RackMacrosResult, { mapped: number[] }> = {
  route: RACK_MACROS_ROUTE,
  maxPerCall: MAX_RACKS_PER_CALL,
  missing: "the Producer Pal remote script isn't running",
  entries: (result) => result.racks,
};

/**
 * Ask the remote script which macros are mapped on each rack, a chunk of racks
 * at a time. Never throws: a rack it can't answer for carries the reason.
 * @param racks - The racks to ask about
 * @param deadline - The request deadline from ToolContext, if any
 * @param maxWaitMs - A shorter wait than the usual one for each call, for a
 *   caller that can do without the answer
 * @returns One answer per rack, in order; null when the remote script isn't
 *   running, so there is nothing to ask
 */
export function lookUpMappedMacros(
  racks: LiveAPI[],
  deadline: number | null | undefined,
  maxWaitMs?: number,
): Promise<MappedMacros[] | null> {
  return askAboutDevices(RACK_MACROS, racks, deadline, maxWaitMs);
}

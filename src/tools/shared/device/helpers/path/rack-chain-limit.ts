// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Racks whose chains are fixed: Live 13's Mid-Side Rack (2) and Multiband
// Rack (3). Live adds nothing when asked (Max `insert_chain` answers 1), so the
// tools check the limit first and say why.

import { plural } from "#src/tools/shared/validation/lists/plural.ts";
import { liveVersionAtLeast } from "#src/tools/shared/helpers/live-api-values.ts";

/** `max_num_chains` exists from this Live version on. */
const CHAIN_LIMIT_MIN_VERSION = "13.0";

/**
 * The most chains a rack takes, when it is already full.
 *
 * Only a positive whole number that the rack's chain count has reached counts.
 * Live 13 reads an unlimited rack as INT_MAX, which no rack reaches. Live 12
 * has no such property and answers with a bare 1, which `getProperty` already
 * drops (it isn't a list); the version is checked as well before a limit is
 * believed. Anything else is no limit.
 * @param rack - The rack device
 * @returns The limit, or null when the rack can take another chain
 */
export function fullRackChainLimit(rack: LiveAPI): number | null {
  const limit = rack.getProperty("max_num_chains");

  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) {
    return null;
  }

  if (rack.getChildCount("chains") < limit) {
    return null;
  }

  return liveVersionAtLeast(CHAIN_LIMIT_MIN_VERSION) ? limit : null;
}

/**
 * Refuse a chain added to a rack whose chains are fixed.
 * @param rack - The rack device a chain would go into
 * @throws Error naming the limit and the chains, when the rack is full
 */
export function refuseFixedChains(rack: LiveAPI): void {
  const limit = fullRackChainLimit(rack);

  if (limit == null) {
    return;
  }

  const names = rack
    .getChildren("chains")
    .map((chain) => chain.getName())
    .filter((name) => name !== "")
    .join(", ");

  throw new Error(
    `${rack.getName()} (id ${rack.id}) has a fixed ${plural(limit, "chain")} (${names}), so it can't take another`,
  );
}

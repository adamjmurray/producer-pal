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

/** Live 13 reads an unlimited rack's limit as INT_MAX; real limits are tiny. */
const MAX_REAL_CHAIN_LIMIT = 1000;

/**
 * The most chains a rack ever takes, when Live fixes it (Mid-Side, Multiband).
 *
 * Only a whole number from 1 up to a small bound counts. Live 12 has no
 * `max_num_chains` and answers with a bare 1, which `getProperty` already drops
 * (it isn't a list); the version is checked first, so Live 12 reads nothing.
 * @param rack - The rack device
 * @returns The limit, or null when the rack's chains aren't fixed
 */
export function fixedChainLimit(rack: LiveAPI): number | null {
  if (!liveVersionAtLeast(CHAIN_LIMIT_MIN_VERSION)) {
    return null;
  }

  const limit = rack.getProperty("max_num_chains");

  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_REAL_CHAIN_LIMIT
  ) {
    return null;
  }

  return limit;
}

/**
 * The rack's fixed chain limit, when it already has that many chains.
 * @param rack - The rack device
 * @returns The limit, or null when the rack can take another chain
 */
export function fullRackChainLimit(rack: LiveAPI): number | null {
  const limit = fixedChainLimit(rack);

  return limit != null && rack.getChildCount("chains") >= limit ? limit : null;
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

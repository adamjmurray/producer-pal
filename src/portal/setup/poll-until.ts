// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type OfflineDeps } from "../offline/offline-deps.ts";

/** A Max device takes a while to start its server. */
const SERVER_POLL_MS = 500;
const SERVER_WAIT_MS = 30_000;

/**
 * Try until it works or the time is up. The first try is immediate, even when
 * the deadline has passed.
 * @param attempt - One try; true when it worked
 * @param deps - The clock
 * @param deadline - When the whole call must be done, as a `now()` time
 * @returns True when a try worked, false when the time ran out
 */
export async function pollUntil(
  attempt: () => Promise<boolean>,
  deps: Pick<OfflineDeps, "now" | "sleep">,
  deadline: number,
): Promise<boolean> {
  const started = deps.now();
  const end = Math.min(started + SERVER_WAIT_MS, deadline);

  for (;;) {
    if (await attempt()) {
      return true;
    }

    const left = end - deps.now();

    if (left <= 0) {
      return false;
    }

    await deps.sleep(Math.min(SERVER_POLL_MS, left));
  }
}

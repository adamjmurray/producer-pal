// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type OfflineDeps } from "../offline/offline-deps.ts";

/** A Max device takes a while to start its server. */
const SERVER_POLL_MS = 500;
const SERVER_WAIT_MS = 30_000;

/**
 * Try until it works or the time is up. The first try is immediate.
 * @param attempt - One try; true when it worked
 * @param deps - The clock
 * @returns True when a try worked, false when the time ran out
 */
export async function pollUntil(
  attempt: () => Promise<boolean>,
  deps: Pick<OfflineDeps, "now" | "sleep">,
): Promise<boolean> {
  const started = deps.now();

  for (;;) {
    if (await attempt()) {
      return true;
    }

    if (deps.now() - started >= SERVER_WAIT_MS) {
      return false;
    }

    await deps.sleep(SERVER_POLL_MS);
  }
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { SETUP_BUDGET_MS } from "../../setup/setup-deadline.ts";
import {
  addProducerPalCall,
  clockedDeps,
  connectsAfter,
  failure,
  LOADED,
  responseText,
  SENT_TIMEOUT,
} from "./offline-add-producer-pal-test-helpers.ts";

describe("add-producer-pal under a client's 60 s limit", () => {
  it("stops waiting for the server in time for the budget, not 30 s after a slow load", async () => {
    // The load answers after 25 s; the old poll would then run 30 s more.
    const { deps, elapsed } = clockedDeps(
      () => 25_000,
      () => LOADED,
    );
    const response = await addProducerPalCall(deps, connectsAfter(1000));

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain(
      'was added to t3 "3-MIDI" but hasn\'t answered yet. Wait a moment, then call ppal-connect.',
    );
    expect(elapsed()).toBeLessThanOrEqual(SETUP_BUDGET_MS);
  });

  it("stops asking about a file Live's browser hasn't found once the budget is spent", async () => {
    const { deps, elapsed } = clockedDeps(
      () => 20_000,
      () => failure(404, "no device"),
    );
    const response = await addProducerPalCall(deps);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain(
      "Nothing was added to the Set. The device file is in the User Library. Call add-producer-pal again in a moment.",
    );
    expect(elapsed()).toBeLessThanOrEqual(SETUP_BUDGET_MS);
  });

  it("keeps saying the device may have been added when the load timed out after it was sent", async () => {
    const { deps } = clockedDeps(
      () => 20_000,
      () => LOADED,
      {
        request: () => Promise.reject(SENT_TIMEOUT),
      },
    );
    const response = await addProducerPalCall(deps);

    expect(responseText(response)).toContain(
      "so it may have been added to a new MIDI track",
    );
  });

  it("stops waiting on a server whose port accepts and never answers, inside the budget", async () => {
    const { deps, elapsed } = clockedDeps(
      () => 25_000,
      () => LOADED,
    );
    // Takes the whole limit it is given, or 60 s without one
    const connect = vi.fn(async (timeoutMs?: number) => {
      await deps.sleep(timeoutMs ?? 60_000);
      throw new Error("Request timed out");
    });
    const response = await addProducerPalCall(deps, connect);

    expect(response.isError).toBe(true);
    expect(responseText(response)).toContain("hasn't answered yet");
    expect(connect).toHaveBeenCalledWith(SETUP_BUDGET_MS - 25_000);
    expect(elapsed()).toBeLessThanOrEqual(SETUP_BUDGET_MS);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * This is the e2e harness's own readiness gate, so it has no e2e case -
 * nothing e2e exercises exists yet when this code runs. See
 * nextReadyStreak() for why one successful probe isn't enough.
 */
import { describe, expect, it } from "vitest";
import { nextReadyStreak } from "./open-live-set-ready.ts";

describe("nextReadyStreak", () => {
  it("counts up on consecutive successes", () => {
    let streak = 0;

    streak = nextReadyStreak(streak, true);
    expect(streak).toBe(1);

    streak = nextReadyStreak(streak, true);
    expect(streak).toBe(2);
  });

  it("resets to 0 on a failed probe", () => {
    let streak = 2;

    streak = nextReadyStreak(streak, false);

    expect(streak).toBe(0);
  });

  it("does not let a single stray success through", () => {
    // A success straight after a failure (or at the start) must not read as
    // "ready" - the caller requires the streak to reach 2.
    const streak = nextReadyStreak(0, true);

    expect(streak).toBeLessThan(2);
  });

  it("requires a fresh streak after a failure breaks it", () => {
    let streak = 1;

    streak = nextReadyStreak(streak, false);
    streak = nextReadyStreak(streak, true);

    expect(streak).toBe(1);
  });
});

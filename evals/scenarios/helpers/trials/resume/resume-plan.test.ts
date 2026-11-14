// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type JsonEvalResult } from "../../json-results/types.ts";
import { describeResume } from "./resume-plan.ts";
import { trialKey, type ResumedTrials } from "./resumed-trials.ts";

const key = (scenario: string, trial = 1): string =>
  trialKey(scenario, "p/m", "default", trial);

describe("describeResume", () => {
  it("counts done, errored and not-run trials against the plan", () => {
    const resumed: ResumedTrials = {
      done: new Map([[key("a"), {} as JsonEvalResult]]),
      errored: new Map([[key("b"), "b.json"]]),
    };

    expect(describeResume("r", resumed, [key("a"), key("b"), key("c")])).toBe(
      "Resuming r: 1 of 3 done; 2 to run (1 errored, 1 not run)",
    );
  });

  it("ignores saved trials the plan doesn't have", () => {
    const resumed: ResumedTrials = {
      done: new Map([[key("a", 2), {} as JsonEvalResult]]),
      errored: new Map([[key("b", 2), "b.json"]]),
    };

    expect(describeResume("r", resumed, [key("a")])).toBe(
      "Resuming r: 0 of 1 done; 1 to run (0 errored, 1 not run)",
    );
  });
});

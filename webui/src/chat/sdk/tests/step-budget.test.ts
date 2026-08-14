// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { MAX_TOOL_STEPS } from "#webui/chat/sdk/client";
import {
  DEFAULT_MAX_TOOL_STEPS,
  MAX_TOOL_STEPS_LIMIT,
  MIN_TOOL_STEPS,
  orchestratorSteps,
  workerSteps,
} from "#webui/chat/sdk/step-budget";
import { MAX_WORKER_STEPS } from "#webui/chat/sdk/subagent/spawn-subagent-tool";

describe("step budgets", () => {
  it("reproduces the shipped numbers at the default base", () => {
    // The derivation replaced three hardcoded constants. Pin the defaults so a
    // change to the ratios is a deliberate act, not a silent re-tuning of every
    // shipped turn.
    expect(DEFAULT_MAX_TOOL_STEPS).toBe(25);
    expect(MAX_TOOL_STEPS).toBe(25);
    expect(orchestratorSteps(DEFAULT_MAX_TOOL_STEPS)).toBe(40);
    expect(MAX_WORKER_STEPS).toBe(30);
  });

  it("keeps orchestrator > worker > base across the whole range", () => {
    // The reason there is one knob rather than three: the ordering can't be
    // inverted by a user, at any setting they can reach.
    for (let base = MIN_TOOL_STEPS; base <= MAX_TOOL_STEPS_LIMIT; base++) {
      expect(workerSteps(base)).toBeGreaterThan(base);
      expect(orchestratorSteps(base)).toBeGreaterThan(workerSteps(base));
    }
  });

  it("derives whole steps", () => {
    // stepCountIs counts generations; a fractional budget is meaningless.
    for (const base of [MIN_TOOL_STEPS, 7, 13, 25, 99, MAX_TOOL_STEPS_LIMIT]) {
      expect(Number.isInteger(orchestratorSteps(base))).toBe(true);
      expect(Number.isInteger(workerSteps(base))).toBe(true);
    }
  });
});

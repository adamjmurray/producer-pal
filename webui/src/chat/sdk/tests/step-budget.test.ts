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
} from "#webui/chat/sdk/step-budget";

describe("step budget", () => {
  it("pins the shipped default", () => {
    // Changing this re-tunes every shipped turn, so make it a deliberate act.
    expect(DEFAULT_MAX_TOOL_STEPS).toBe(25);
    // client.ts re-exports the same number rather than keeping a copy.
    expect(MAX_TOOL_STEPS).toBe(DEFAULT_MAX_TOOL_STEPS);
  });

  it("leaves the default inside the range a user can set", () => {
    expect(MIN_TOOL_STEPS).toBeLessThan(DEFAULT_MAX_TOOL_STEPS);
    expect(DEFAULT_MAX_TOOL_STEPS).toBeLessThan(MAX_TOOL_STEPS_LIMIT);
  });
});

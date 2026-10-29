// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { isProviderRefusal } from "./provider-refusal.ts";

describe("isProviderRefusal", () => {
  it.each([
    "codex CLI exited 1. codex CLI error: Selected model is at capacity. Please try a different model.",
    "codex CLI exited 1. codex CLI error: You’ve hit your usage limit. Upgrade to Pro",
    "Your credit balance is too low to access the Anthropic API. (HTTP 400)",
    "429 Too Many Requests",
    "Rate limit exceeded",
    "The model is overloaded",
    "quota exhausted",
    "HTTP 529",
  ])("treats %j as a refusal", (error) => {
    expect(isProviderRefusal(error)).toBe(true);
  });

  it.each([
    "Live would not swap Sets",
    "connection refused",
    "codex CLI timed out after 600s",
  ])("does not treat %j as a refusal", (error) => {
    expect(isProviderRefusal(error)).toBe(false);
  });
});

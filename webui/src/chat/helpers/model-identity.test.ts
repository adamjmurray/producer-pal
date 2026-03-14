// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { isModelMismatch } from "./model-identity";

describe("isModelMismatch", () => {
  it("returns false for identical strings", () => {
    expect(isModelMismatch("gpt-4o", "gpt-4o")).toBe(false);
  });

  it("returns false when only a date suffix differs (YYYYMMDD)", () => {
    expect(isModelMismatch("gpt-4o", "gpt-4o-20250301")).toBe(false);
  });

  it("returns false when only a date suffix differs (YYYY-MM-DD)", () => {
    expect(isModelMismatch("gpt-4o", "gpt-4o-2025-03-01")).toBe(false);
  });

  it("returns false when only an org prefix differs", () => {
    expect(
      isModelMismatch("claude-sonnet-4", "anthropic/claude-sonnet-4"),
    ).toBe(false);
  });

  it("returns false when both org prefix and date suffix differ", () => {
    expect(
      isModelMismatch("claude-sonnet-4", "anthropic/claude-sonnet-4-20250514"),
    ).toBe(false);
  });

  it("returns false when requested has date and actual has org + date", () => {
    expect(
      isModelMismatch(
        "claude-sonnet-4-20250514",
        "anthropic/claude-sonnet-4-20250514",
      ),
    ).toBe(false);
  });

  it("returns true for genuinely different models", () => {
    expect(isModelMismatch("gpt-4o", "gpt-4o-mini")).toBe(true);
  });

  it("returns true for different model sizes", () => {
    expect(isModelMismatch("llama-3.1-8b", "llama-3.1-70b")).toBe(true);
  });

  it("returns true for different model families", () => {
    expect(isModelMismatch("claude-sonnet-4", "claude-haiku-4")).toBe(true);
  });

  it("returns true when different models both have date suffixes", () => {
    expect(isModelMismatch("gpt-4o-20250301", "gpt-4o-mini-20250301")).toBe(
      true,
    );
  });

  it("handles nested org paths", () => {
    expect(isModelMismatch("mistral-7b", "mistralai/mistral-7b")).toBe(false);
  });
});

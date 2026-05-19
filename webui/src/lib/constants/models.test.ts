// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  OPENAI_MODELS,
  OPENAI_REALTIME_MODEL,
  isRealtimeModel,
} from "#webui/lib/constants/models";

describe("isRealtimeModel", () => {
  it("returns true for the OpenAI realtime model", () => {
    expect(isRealtimeModel(OPENAI_REALTIME_MODEL)).toBe(true);
  });

  it("returns false for standard chat models", () => {
    expect(isRealtimeModel("gpt-5.5")).toBe(false);
    expect(isRealtimeModel("claude-sonnet-4-6")).toBe(false);
  });

  it("returns false for null or undefined", () => {
    expect(isRealtimeModel(null)).toBe(false);
    expect(isRealtimeModel(undefined)).toBe(false);
  });

  it("returns false for unknown model strings", () => {
    expect(isRealtimeModel("some-unrelated-model")).toBe(false);
  });
});

describe("OPENAI_MODELS", () => {
  it("includes the realtime model with kind marker", () => {
    const entry = OPENAI_MODELS.find((m) => m.value === OPENAI_REALTIME_MODEL);

    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("realtime");
  });
});

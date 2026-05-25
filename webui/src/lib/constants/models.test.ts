// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  OPENAI_MODELS,
  OPENAI_REALTIME_MODEL,
  isRealtimeSelection,
} from "#webui/lib/constants/models";

describe("isRealtimeSelection", () => {
  it("returns true for the OpenAI realtime model under the openai provider", () => {
    expect(isRealtimeSelection("openai", OPENAI_REALTIME_MODEL)).toBe(true);
  });

  it("returns false for the realtime model id under a non-openai provider", () => {
    // The bug this guards: a custom/OpenAI-compatible provider reusing the
    // realtime model id must NOT route to voice (no key/transport for it).
    expect(isRealtimeSelection("custom", OPENAI_REALTIME_MODEL)).toBe(false);
    expect(isRealtimeSelection("openrouter", OPENAI_REALTIME_MODEL)).toBe(
      false,
    );
    expect(isRealtimeSelection("gemini", OPENAI_REALTIME_MODEL)).toBe(false);
  });

  it("returns false for standard chat models", () => {
    expect(isRealtimeSelection("openai", "gpt-5.5")).toBe(false);
    expect(isRealtimeSelection("anthropic", "claude-sonnet-4-6")).toBe(false);
  });

  it("returns false for null or undefined", () => {
    expect(isRealtimeSelection("openai", null)).toBe(false);
    expect(isRealtimeSelection("openai", undefined)).toBe(false);
  });

  it("returns false for unknown model strings", () => {
    expect(isRealtimeSelection("openai", "some-unrelated-model")).toBe(false);
  });
});

describe("OPENAI_MODELS", () => {
  it("includes the realtime model with kind marker", () => {
    const entry = OPENAI_MODELS.find((m) => m.value === OPENAI_REALTIME_MODEL);

    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("realtime");
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  OPENAI_MODELS,
  OPENAI_REALTIME_MODEL,
  isRealtimeModelId,
  isRealtimeSelection,
  resolveRealtimeModel,
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

  it("treats a free-text realtime id under openai as realtime (Other...)", () => {
    // The openness path: a realtime model not shipped as a preset, entered via
    // the "Other..." field, still enables voice.
    expect(isRealtimeSelection("openai", "gpt-4o-realtime-preview")).toBe(true);
    expect(isRealtimeSelection("openai", "gpt-realtime")).toBe(true);
  });

  it("does not treat a free-text realtime id under a non-openai provider as realtime", () => {
    // Voice is OpenAI-only; an openrouter/custom realtime-looking id stays in
    // chat (no key/transport for it).
    expect(isRealtimeSelection("openrouter", "openai/gpt-realtime")).toBe(
      false,
    );
    expect(isRealtimeSelection("custom", "gpt-4o-realtime-preview")).toBe(
      false,
    );
  });
});

describe("isRealtimeModelId", () => {
  it("matches ids containing 'realtime' (case-insensitive)", () => {
    expect(isRealtimeModelId("gpt-realtime-2")).toBe(true);
    expect(isRealtimeModelId("gpt-4o-realtime-preview")).toBe(true);
    expect(isRealtimeModelId("GPT-Realtime")).toBe(true);
  });

  it("does not match standard chat model ids", () => {
    expect(isRealtimeModelId("gpt-5.5")).toBe(false);
    expect(isRealtimeModelId("claude-sonnet-4-6")).toBe(false);
  });

  it("returns false for null or undefined", () => {
    expect(isRealtimeModelId(null)).toBe(false);
    expect(isRealtimeModelId(undefined)).toBe(false);
  });
});

describe("resolveRealtimeModel", () => {
  it("returns the saved model when it is a realtime selection", () => {
    expect(resolveRealtimeModel("openai", "gpt-4o-realtime-preview")).toBe(
      "gpt-4o-realtime-preview",
    );
    expect(resolveRealtimeModel("openai", OPENAI_REALTIME_MODEL)).toBe(
      OPENAI_REALTIME_MODEL,
    );
  });

  it("falls back to the default for a non-realtime or foreign selection", () => {
    // Chat model, a realtime id under a non-voice provider, or null → default.
    expect(resolveRealtimeModel("openai", "gpt-5.5")).toBe(
      OPENAI_REALTIME_MODEL,
    );
    expect(resolveRealtimeModel("openrouter", "openai/gpt-realtime")).toBe(
      OPENAI_REALTIME_MODEL,
    );
    expect(resolveRealtimeModel("openai", null)).toBe(OPENAI_REALTIME_MODEL);
  });
});

describe("OPENAI_MODELS", () => {
  it("includes the realtime model with kind marker", () => {
    const entry = OPENAI_MODELS.find((m) => m.value === OPENAI_REALTIME_MODEL);

    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("realtime");
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { reasoningReplayFor } from "#webui/chat/sdk/reasoning-replay";

describe("reasoningReplayFor", () => {
  it("replays Gemini's signatures on the direct Google provider, at any thinking level", () => {
    expect(
      reasoningReplayFor(undefined, "gemini-3.8-flash", "google.generative-ai"),
    ).toStrictEqual({ google: "gemini-3.8-flash" });
  });

  it("replays nothing for a Google model through the Vercel gateway", () => {
    expect(
      reasoningReplayFor(
        { google: { thinkingConfig: { includeThoughts: true } } },
        "google/gemini-3.8-flash",
        "gateway",
      ),
    ).toBe(false);
  });

  it("replays nothing when the provider is unknown", () => {
    expect(reasoningReplayFor(undefined, "gemini-3.8-flash")).toBe(false);
  });
});

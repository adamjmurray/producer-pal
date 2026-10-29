// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { buildJevState } from "../jev-state.ts";

const turn = (result: string) => ({
  userMessage: "make a clip",
  assistantResponse: "done",
  toolCalls: [{ name: "ppal-read-live-set", args: {}, result }],
});

describe("buildJevState", () => {
  it("leaves a small run untouched", () => {
    const { state, truncated } = buildJevState(
      [turn("ok")],
      [{ pass: false, label: "has notes", message: "none" }],
    );

    expect(truncated).toBe(false);
    expect(state.transcript).toContain("→ ok");
    expect(state.deterministicChecks).toContain("✗ has notes — none");
  });

  it("says so when there are no checks", () => {
    expect(buildJevState([turn("ok")], []).state.deterministicChecks).toBe(
      "(no deterministic checks)",
    );
  });

  it("cuts only the longest result and marks it", () => {
    const { state, truncated } = buildJevState(
      [turn("short"), turn("x".repeat(5000))],
      [],
      1500,
    );

    expect(truncated).toBe(true);
    expect(state.transcript).toContain("→ short");
    expect(state.transcript).toMatch(/\[truncated \d+ chars\]/);
    expect(state.transcript.length).toBeLessThanOrEqual(1500);
  });

  it("keeps the head and tail when results alone can't fit", () => {
    const turns = Array.from({ length: 50 }, (_, i) => turn(`result ${i}`));
    const { state, truncated } = buildJevState(turns, [], 1000);

    expect(truncated).toBe(true);
    expect(state.transcript.length).toBeLessThanOrEqual(1000);
    expect(state.transcript).toContain("[Turn 1]");
    expect(state.transcript).toContain("middle of transcript truncated");
    expect(state.transcript).toContain("result 49");
  });
});

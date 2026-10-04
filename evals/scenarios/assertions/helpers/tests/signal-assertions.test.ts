// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { asSignal, isSignalAssertion } from "../signal-assertions.ts";

describe("isSignalAssertion", () => {
  it("treats response_contains as a non-gating signal", () => {
    expect(isSignalAssertion({ type: "response_contains", pattern: /x/ })).toBe(
      true,
    );
  });

  it("treats every other assertion as gating", () => {
    expect(
      isSignalAssertion({ type: "tool_called", tool: "ppal-connect" }),
    ).toBe(false);
  });
});

describe("asSignal", () => {
  const custom = {
    type: "custom",
    description: "route",
    assert: () => true,
  } as const;

  it("marks a custom assertion as a non-gating signal", () => {
    expect(isSignalAssertion(custom)).toBe(false);
    expect(isSignalAssertion(asSignal(custom))).toBe(true);
  });

  it("refuses an assertion that has no signal flag", () => {
    expect(() =>
      asSignal({ type: "tool_called", tool: "ppal-connect" }),
    ).toThrow("only a custom assertion");
  });
});

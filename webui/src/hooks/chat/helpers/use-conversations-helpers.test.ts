// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  deriveTitle,
  sumMessageUsage,
} from "#webui/hooks/chat/helpers/use-conversations-helpers";

describe("deriveTitle", () => {
  it("uses first user message as title", () => {
    const history = [{ role: "user", content: "Write a melody" }];

    expect(deriveTitle(null, history)).toBe("Write a melody");
  });

  it("skips connect command and uses second user message", () => {
    const history = [
      { role: "user", content: "connect to ableton" },
      { role: "assistant", content: "Connected!" },
      { role: "user", content: "Make a beat" },
    ];

    expect(deriveTitle(null, history)).toBe("Make a beat");
  });

  it("keeps manually-set title", () => {
    const history = [{ role: "user", content: "Hello" }];

    expect(deriveTitle("My Custom Title", history)).toBe("My Custom Title");
  });

  it("returns currentTitle when no user messages", () => {
    expect(deriveTitle("Old Title", [])).toBe("Old Title");
  });
});

describe("sumMessageUsage", () => {
  it("returns null for empty history", () => {
    expect(sumMessageUsage([])).toBeNull();
  });

  it("returns null when no messages have usage", () => {
    const history = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];

    expect(sumMessageUsage(history)).toBeNull();
  });

  it("sums usage across assistant messages", () => {
    const history = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "hi",
        usage: { inputTokens: 100, outputTokens: 20 },
      },
      { role: "user", content: "bye" },
      {
        role: "assistant",
        content: "cya",
        usage: { inputTokens: 200, outputTokens: 30 },
      },
    ];

    expect(sumMessageUsage(history)).toStrictEqual({
      inputTokens: 300,
      outputTokens: 50,
    });
  });

  it("skips user messages and assistant messages without usage", () => {
    const history = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "no usage here" },
      {
        role: "assistant",
        content: "with usage",
        usage: { inputTokens: 50, outputTokens: 10 },
      },
    ];

    expect(sumMessageUsage(history)).toStrictEqual({
      inputTokens: 50,
      outputTokens: 10,
    });
  });
});

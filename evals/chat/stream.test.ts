// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for collapseNewlines in collapse-stdout-newlines.ts
 */
import { describe, it, expect } from "vitest";
import { collapseNewlines } from "./shared/collapse-stdout-newlines.ts";

describe("collapseNewlines", () => {
  it("passes through text without newlines", () => {
    expect(collapseNewlines("hello", 0)).toStrictEqual({
      text: "hello",
      trailingNewlines: 0,
    });
  });

  it("passes through a single newline", () => {
    expect(collapseNewlines("\n", 0)).toStrictEqual({
      text: "\n",
      trailingNewlines: 1,
    });
  });

  it("passes through two consecutive newlines", () => {
    expect(collapseNewlines("\n\n", 0)).toStrictEqual({
      text: "\n\n",
      trailingNewlines: 2,
    });
  });

  it("collapses three newlines to two", () => {
    expect(collapseNewlines("\n\n\n", 0)).toStrictEqual({
      text: "\n\n",
      trailingNewlines: 3,
    });
  });

  it("collapses many newlines to two", () => {
    expect(collapseNewlines("\n\n\n\n\n\n", 0)).toStrictEqual({
      text: "\n\n",
      trailingNewlines: 6,
    });
  });

  it("collapses embedded runs", () => {
    expect(collapseNewlines("hello\n\n\n\nworld", 0)).toStrictEqual({
      text: "hello\n\nworld",
      trailingNewlines: 0,
    });
  });

  it("preserves single empty lines between paragraphs", () => {
    expect(collapseNewlines("a\n\nb\n\nc", 0)).toStrictEqual({
      text: "a\n\nb\n\nc",
      trailingNewlines: 0,
    });
  });

  it("handles trailing newlines from prior chunk", () => {
    expect(collapseNewlines("\n\n", 1)).toStrictEqual({
      text: "\n",
      trailingNewlines: 3,
    });
  });

  it("suppresses all newlines when prior chunk already at limit", () => {
    expect(collapseNewlines("\n\n\n", 2)).toStrictEqual({
      text: "",
      trailingNewlines: 5,
    });
  });

  it("resets counter on non-newline after prior trailing", () => {
    expect(collapseNewlines("x", 5)).toStrictEqual({
      text: "x",
      trailingNewlines: 0,
    });
  });

  it("handles empty string", () => {
    expect(collapseNewlines("", 0)).toStrictEqual({
      text: "",
      trailingNewlines: 0,
    });
  });

  it("preserves trailing count through empty string", () => {
    expect(collapseNewlines("", 3)).toStrictEqual({
      text: "",
      trailingNewlines: 3,
    });
  });

  it("handles multi-chunk streaming scenario", () => {
    const r1 = collapseNewlines("hello\n", 0);

    expect(r1).toStrictEqual({ text: "hello\n", trailingNewlines: 1 });

    const r2 = collapseNewlines("\n", r1.trailingNewlines);

    expect(r2).toStrictEqual({ text: "\n", trailingNewlines: 2 });

    const r3 = collapseNewlines("\n\ntext", r2.trailingNewlines);

    expect(r3).toStrictEqual({ text: "text", trailingNewlines: 0 });
  });
});

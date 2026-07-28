// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";

import { mcpResultText, mcpResultWarnings } from "./mcp-result-text.ts";

/** A result shaped the way `max-api-adapter.ts` builds one: payload, then warnings. */
const WARNED_RESULT = {
  content: [
    { type: "text", text: '{"id":"track1"}' },
    {
      type: "text",
      text: "WARNING: quantize parameter ignored for audio clip",
    },
    { type: "text", text: "WARNING: no clip at trackIndex 8, sceneIndex 0" },
  ],
};

describe("mcpResultText", () => {
  it("returns the payload block from a bare content array", () => {
    expect(mcpResultText(WARNED_RESULT.content)).toBe('{"id":"track1"}');
  });

  it("returns the payload block from a whole envelope", () => {
    expect(mcpResultText(WARNED_RESULT)).toBe('{"id":"track1"}');
  });

  it("leaves warnings out, so the payload stays parseable on its own", () => {
    expect(JSON.parse(mcpResultText(WARNED_RESULT))).toStrictEqual({
      id: "track1",
    });
  });

  it("returns '' for values carrying no text blocks", () => {
    expect(mcpResultText(null)).toBe("");
    expect(mcpResultText(undefined)).toBe("");
    expect(mcpResultText({})).toBe("");
    expect(mcpResultText([])).toBe("");
    expect(mcpResultText({ content: [{ type: "image", data: "…" }] })).toBe("");
  });
});

describe("mcpResultWarnings", () => {
  // The bug this pins: every transport recorded only the payload block, so the
  // relayed `console.warn` output — the project's warn-and-skip signal, and what
  // the device scenarios grade acceptance on — vanished from the recorded call.
  // Checks that asked "did the engine take this?" silently answered yes.
  it("returns every relayed WARNING block, in order", () => {
    expect(mcpResultWarnings(WARNED_RESULT)).toStrictEqual([
      "WARNING: quantize parameter ignored for audio clip",
      "WARNING: no clip at trackIndex 8, sceneIndex 0",
    ]);
  });

  it("reads a bare content array too", () => {
    expect(mcpResultWarnings(WARNED_RESULT.content)).toHaveLength(2);
  });

  it("returns [] when the tool warned about nothing", () => {
    expect(
      mcpResultWarnings({ content: [{ type: "text", text: "ok" }] }),
    ).toStrictEqual([]);
  });

  it("returns [] for values carrying no content", () => {
    expect(mcpResultWarnings(null)).toStrictEqual([]);
    expect(mcpResultWarnings(undefined)).toStrictEqual([]);
    expect(mcpResultWarnings("plain text")).toStrictEqual([]);
    expect(mcpResultWarnings({})).toStrictEqual([]);
  });

  it("ignores non-text blocks and payload text that merely mentions a warning", () => {
    expect(
      mcpResultWarnings({
        content: [
          { type: "text", text: 'notes: "a warning about the mix"' },
          { type: "image", data: "…" },
        ],
      }),
    ).toStrictEqual([]);
  });
});

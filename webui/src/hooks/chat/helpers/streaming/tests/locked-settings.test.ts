// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  resolveLockedNotation,
  resolveLockedSmallModelMode,
} from "#webui/hooks/chat/helpers/streaming/locked-settings";

describe("resolveLockedNotation", () => {
  it("prefers the conversation's locked notation over the current setting", () => {
    // The whole point of locking: a chat whose notes were written in stark
    // keeps being parsed as stark after the user switches the dropdown.
    expect(
      resolveLockedNotation({
        lockedNotation: "stark",
        notation: "barbeat",
      }),
    ).toBe("stark");
  });

  it("falls back to the current setting for a brand-new conversation", () => {
    expect(
      resolveLockedNotation({ lockedNotation: null, notation: "midi-json" }),
    ).toBe("midi-json");
  });

  it("returns null when the caller has no notation of its own", () => {
    // No header, so the request falls through to the device global — the same
    // contract an external MCP client gets.
    expect(resolveLockedNotation({})).toBeNull();
  });

  it("ignores an unknown notation from a hand-edited record", () => {
    expect(
      resolveLockedNotation({ lockedNotation: "tablature", notation: 42 }),
    ).toBeNull();
  });
});

describe("resolveLockedSmallModelMode", () => {
  it("prefers the conversation's locked mode over the current setting", () => {
    // A restored conversation keeps the tool schemas and skills variant it
    // started with, whatever the Settings toggle says now.
    expect(
      resolveLockedSmallModelMode({
        lockedSmallModelMode: true,
        smallModelMode: false,
      }),
    ).toBe(true);
  });

  it("falls back to the current setting for a brand-new conversation", () => {
    expect(
      resolveLockedSmallModelMode({
        lockedSmallModelMode: null,
        smallModelMode: true,
      }),
    ).toBe(true);
  });

  it("defaults to off when neither is present", () => {
    expect(resolveLockedSmallModelMode({})).toBe(false);
  });
});

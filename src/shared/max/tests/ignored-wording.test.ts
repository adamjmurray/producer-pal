// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";
import { ignoredText, warnIgnored } from "#src/shared/max/ignored-wording.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

describe("ignoredText", () => {
  it("reads `X ignored: reason` for one param", () => {
    expect(ignoredText("gainDb", "the clip is MIDI")).toBe(
      "gainDb ignored: the clip is MIDI",
    );
  });

  it("joins several params with a comma, never a slash", () => {
    expect(ignoredText(["pan", "mute"], "a take lane takes only name")).toBe(
      "pan, mute ignored: a take lane takes only name",
    );
  });
});

describe("warnIgnored", () => {
  it("warns with the same text", () => {
    warnIgnored(["trackIndex", "sceneIndex"], '"path" names the clip');

    expect(consoleMock.warn).toHaveBeenCalledWith(
      'trackIndex, sceneIndex ignored: "path" names the clip',
    );
  });
});

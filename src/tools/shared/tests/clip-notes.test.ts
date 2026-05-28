// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { getPlayableNoteCount } from "#src/tools/shared/clip-notes.ts";

function makeClip(callReturn: string): LiveAPI {
  return {
    getProperty: vi.fn(() => 4),
    call: vi.fn(() => callReturn),
  } as unknown as LiveAPI;
}

describe("getPlayableNoteCount", () => {
  it("returns the note count when notes are present", () => {
    const clip = makeClip(JSON.stringify({ notes: [{}, {}, {}] }));

    expect(getPlayableNoteCount(clip)).toBe(3);
  });

  it("returns 0 when notes array is empty", () => {
    const clip = makeClip(JSON.stringify({ notes: [] }));

    expect(getPlayableNoteCount(clip)).toBe(0);
  });

  it("returns 0 when the result has no notes key", () => {
    const clip = makeClip(JSON.stringify({}));

    expect(getPlayableNoteCount(clip)).toBe(0);
  });

  it("returns 0 when the parsed result is null", () => {
    const clip = makeClip("null");

    expect(getPlayableNoteCount(clip)).toBe(0);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { notesClipProblem } from "./notes-clip.ts";

/**
 * @param pitch - MIDI pitch
 * @param start - Start in beats
 * @returns A note
 */
const note = (pitch: number, start: number): NoteEvent => ({
  pitch,
  start_time: start,
  duration: 0.25,
  velocity: 100,
});

describe("notesClipProblem", () => {
  it("accepts C1 on beats 1 to 4", () => {
    expect(
      notesClipProblem([note(36, 3), note(36, 0), note(36, 1), note(36, 2)]),
    ).toBeNull();
  });

  it("names an added pitch", () => {
    expect(notesClipProblem([note(36, 0), note(38, 1)])).toMatch(
      /pitches 36, 38/,
    );
  });

  it("names missing or extra beats", () => {
    expect(notesClipProblem([note(36, 0), note(36, 1)])).toMatch(
      /beats 0, 1, wanted 0, 1, 2, 3/,
    );
  });
});

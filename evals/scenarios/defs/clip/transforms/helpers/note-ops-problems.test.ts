// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  mergeProblem,
  repeatProblem,
  rollProblem,
  splitProblem,
} from "./note-ops-problems.ts";

const note = (pitch: number, start: number, duration: number): NoteEvent => ({
  pitch,
  start_time: start,
  duration,
  velocity: 100,
});

describe("rollProblem", () => {
  const before = [note(60, 0, 1), note(62, 1, 0.5)];

  it("accepts each note cut into equal parts", () => {
    const after = [
      ...[0, 0.25, 0.5, 0.75].map((s) => note(60, s, 0.25)),
      ...[1, 1.125, 1.25, 1.375].map((s) => note(62, s, 0.125)),
    ];

    expect(rollProblem(before, after, 4)).toBeNull();
  });

  it("rejects notes left whole", () => {
    expect(rollProblem(before, before, 4)).toContain("count");
  });

  it("rejects parts of the wrong length", () => {
    const after = [
      ...[0, 0.25, 0.5, 0.75].map((s) => note(60, s, 0.5)),
      ...[1, 1.125, 1.25, 1.375].map((s) => note(62, s, 0.125)),
    ];

    expect(rollProblem(before, after, 4)).toContain("duration");
  });
});

describe("repeatProblem", () => {
  const before = [note(60, 0, 1), note(64, 1, 1)];

  it("accepts originals plus copies an offset later", () => {
    const after = [...before, note(60, 0.5, 1), note(64, 1.5, 1)];

    expect(repeatProblem(before, after, 0.5)).toBeNull();
  });

  it("accepts originals cut off where their copy starts", () => {
    const after = [
      note(60, 0, 0.5),
      note(64, 1, 0.5),
      note(60, 0.5, 1),
      note(64, 1.5, 1),
    ];

    expect(repeatProblem(before, after, 0.5)).toBeNull();
  });

  it("rejects originals cut shorter than their copy start", () => {
    const after = [
      note(60, 0, 0.25),
      note(64, 1, 0.25),
      note(60, 0.5, 1),
      note(64, 1.5, 1),
    ];

    expect(repeatProblem(before, after, 0.5)).not.toBeNull();
  });

  it("rejects a mix of cut and uncut originals", () => {
    const after = [
      note(60, 0, 0.5),
      note(64, 1, 1),
      note(60, 0.5, 1),
      note(64, 1.5, 1),
    ];

    expect(repeatProblem(before, after, 0.5)).not.toBeNull();
  });

  it("rejects a lost original", () => {
    const after = [note(60, 0.5, 1), note(64, 1.5, 1)];

    expect(repeatProblem(before, after, 0.5)).not.toBeNull();
  });

  it("rejects a copy at the wrong offset", () => {
    const after = [...before, note(60, 0.25, 1), note(64, 1.25, 1)];

    expect(repeatProblem(before, after, 0.5)).not.toBeNull();
  });
});

describe("mergeProblem", () => {
  const before = [note(36, 0, 0.25), note(36, 1, 0.25), note(38, 1, 0.25)];

  it("accepts one note per lane from first hit to last end", () => {
    const after = [note(36, 0, 1.25), note(38, 1, 0.25)];

    expect(mergeProblem(before, after)).toBeNull();
  });

  it("accepts a lane held longer than its last hit", () => {
    expect(mergeProblem(before, [note(36, 0, 4), note(38, 1, 3)])).toBeNull();
  });

  it("rejects a lane left in pieces", () => {
    expect(mergeProblem(before, before)).toContain("pitch 36: expected 1 note");
  });

  it("rejects a lane that starts late", () => {
    const after = [note(36, 1, 0.25), note(38, 1, 0.25)];

    expect(mergeProblem(before, after)).toContain("should start at 0");
  });

  it("rejects a lane that stops early", () => {
    const after = [note(36, 0, 1), note(38, 1, 0.25)];

    expect(mergeProblem(before, after)).toContain("should last until 1.25");
  });

  it("rejects a lost lane", () => {
    expect(mergeProblem(before, [note(36, 0, 1.25)])).toContain("pitch 38");
  });

  it("rejects a pitch that was not there", () => {
    const after = [note(36, 0, 1.25), note(38, 1, 0.25), note(40, 0, 1)];

    expect(mergeProblem(before, after)).toContain("not in the clip");
  });
});

describe("splitProblem", () => {
  const spec = { pitch: 48, length: 16, cuts: [8, 12] };

  it("accepts contiguous pieces cut where asked", () => {
    const after = [note(48, 12, 4), note(48, 0, 8), note(48, 8, 4)];

    expect(splitProblem(after, spec)).toBeNull();
  });

  it("rejects the wrong cut position", () => {
    const after = [note(48, 0, 4), note(48, 4, 8), note(48, 12, 4)];

    expect(splitProblem(after, spec)).toContain(
      "expected p48 0-8, 8-12, 12-16",
    );
  });

  it("rejects a gap", () => {
    const after = [note(48, 0, 8), note(48, 8, 3), note(48, 12, 4)];

    expect(splitProblem(after, spec)).not.toBeNull();
  });

  it("rejects an extra cut", () => {
    const after = [
      note(48, 0, 8),
      note(48, 8, 2),
      note(48, 10, 2),
      note(48, 12, 4),
    ];

    expect(splitProblem(after, spec)).not.toBeNull();
  });

  it("rejects a different pitch", () => {
    const after = [note(48, 0, 8), note(50, 8, 4), note(48, 12, 4)];

    expect(splitProblem(after, spec)).not.toBeNull();
  });

  it("rejects an uncut note", () => {
    expect(splitProblem([note(48, 0, 16)], spec)).not.toBeNull();
  });
});

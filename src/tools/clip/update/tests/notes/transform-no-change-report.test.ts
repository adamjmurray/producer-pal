// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type TransformOutcome } from "#src/notation/transform/transformed-count.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { newClipReasons } from "../../helpers/entries/clip-reasons.ts";
import {
  reportTransformsChangedNothing,
  type StagedTransforms,
} from "../../helpers/notes/transform-no-change-report.ts";

function outcome(matchedCount: number, selected: boolean): TransformOutcome {
  const matched = new Set<NoteEvent>();

  for (let pitch = 60; pitch < 60 + matchedCount; pitch++) {
    matched.add({ pitch, start_time: 0, duration: 1, velocity: 100 });
  }

  return {
    changed: new Set(),
    deleted: [],
    original: new Map(),
    roots: new Map(),
    matched,
    selected,
    failed: false,
  };
}

describe("reportTransformsChangedNothing", () => {
  it("judges by the earlier stage when it matched more and the later one selected nothing", () => {
    const reasons = newClipReasons();
    const staged: StagedTransforms = { defer: true };

    reportTransformsChangedNothing(
      reasons,
      "clip-1",
      outcome(3, true),
      { transformed: 0 },
      staged,
    );
    staged.defer = false;
    reportTransformsChangedNothing(
      reasons,
      "clip-1",
      outcome(0, false),
      { transformed: 0 },
      staged,
    );

    expect(reasons.said.get("clip-1")).toStrictEqual([
      "the transforms changed none of the 3 matched notes",
    ]);
  });
});

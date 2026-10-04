// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { buildOutcome } from "#src/notation/transform/helpers/note-ops/transform-outcome.ts";
import { testNote } from "../evaluator/transform-evaluator-test-helpers.ts";

describe("buildOutcome", () => {
  it("counts a note with no known origin as changed, keeping no starting note alive", () => {
    const start = testNote({ pitch: 60 });
    const stranger = testNote({ pitch: 72 });
    const original = new Map([[start, { ...start }]]);

    const outcome = buildOutcome(original, new Map(), new Set([stranger]), [
      stranger,
    ]);

    expect(outcome.changed).toStrictEqual(new Set([stranger]));
    expect(outcome.deleted).toStrictEqual([start]);
  });

  it("leaves an untouched note with no known origin out of the changes", () => {
    const stranger = testNote({ pitch: 72 });

    const outcome = buildOutcome(new Map(), new Map(), new Set(), [stranger]);

    expect(outcome.changed).toStrictEqual(new Set());
    expect(outcome.deleted).toStrictEqual([]);
  });
});

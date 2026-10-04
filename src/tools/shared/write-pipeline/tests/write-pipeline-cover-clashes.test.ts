// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { coverClashes } from "../plans/covers.ts";
import { type Cover } from "../write-pipeline-types.ts";

const lane = (from: number, to: number, as: string): Cover => ({
  lane: "t0",
  from,
  to,
  as,
});

describe("coverClashes", () => {
  it("names a later target once though several of its covers touch", () => {
    const { replaced, shortened } = coverClashes(
      [[lane(0, 4, "a")], [lane(2, 3, "b1"), lane(3.5, 6, "b2")]],
      new Set(),
    );

    expect(replaced.size).toBe(0);
    expect(shortened.get(0)).toStrictEqual([{ index: 1, as: "b1" }]);
  });

  it("leaves out a later target that covers nothing the others didn't", () => {
    const { replaced, shortened } = coverClashes(
      [[lane(0, 4, "a")], [lane(2, 6, "b")], [lane(0, 4, "c")]],
      new Set(),
    );

    expect(replaced.get(0)).toStrictEqual([{ index: 2, as: "c" }]);
    expect(shortened.get(1)).toStrictEqual([{ index: 2, as: "c" }]);
  });
});

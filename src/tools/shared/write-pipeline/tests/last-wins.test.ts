// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { lastWins } from "../plans/last-wins.ts";

describe("lastWins", () => {
  it("finds nothing overridden when every item claims its own key", () => {
    expect(lastWins([["a"], ["b"], ["c"]])).toStrictEqual(new Map());
  });

  it("lets the last item to claim a key override every earlier one", () => {
    expect(lastWins([["a"], ["a"], ["b"], ["a"]])).toStrictEqual(
      new Map([
        [0, 3],
        [1, 3],
      ]),
    );
  });

  it("matches items on any claim they share", () => {
    // Two spellings of one object: the first and last share `obj`.
    expect(
      lastWins([["id:1", "obj"], ["id:2"], ["name:x", "obj"]]),
    ).toStrictEqual(new Map([[0, 2]]));
  });

  it("doesn't let an overridden item block an earlier one", () => {
    // Item 1 loses to item 2 on `b`, so its claim on `a` is never made, and
    // item 0 stands.
    expect(lastWins([["a"], ["a", "b"], ["b"]])).toStrictEqual(
      new Map([[1, 2]]),
    );
  });

  it("lets an item that claims nothing stand", () => {
    expect(lastWins([[], [], ["a"]])).toStrictEqual(new Map());
  });
});

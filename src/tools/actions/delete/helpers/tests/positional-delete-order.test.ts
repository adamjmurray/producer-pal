// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { positionalDeleteOrder } from "../positional-delete-order.ts";

/**
 * @param paths - Live API paths, in call order
 * @returns Targets with a stub object at each path
 */
function targetsAt(paths: string[]): { index: number; object: LiveAPI }[] {
  return paths.map((path, index) => ({
    index,
    object: { path } as LiveAPI,
  }));
}

describe("positionalDeleteOrder", () => {
  it("deletes tracks highest first, with a main track in between", () => {
    const order = positionalDeleteOrder(
      targetsAt([
        String(livePath.track(1)),
        String(livePath.masterTrack()),
        String(livePath.track(3)),
      ]),
      "track",
    );

    // t3 before t1; the main track, which has no position, goes last.
    expect(order).toStrictEqual([2, 0, 1]);
  });

  it("keeps the order whatever place the main track holds", () => {
    const main = String(livePath.masterTrack());
    const paths = [
      String(livePath.track(0)),
      String(livePath.track(2)),
      String(livePath.track(1)),
    ];

    for (let at = 0; at <= paths.length; at++) {
      const named = paths.toSpliced(at, 0, main);
      const order = positionalDeleteOrder(targetsAt(named), "track");
      const positions = order.map((i) => named[i]);

      expect(positions).toStrictEqual([
        String(livePath.track(2)),
        String(livePath.track(1)),
        String(livePath.track(0)),
        main,
      ]);
    }
  });

  it("keeps two targets with no position in call order", () => {
    const main = String(livePath.masterTrack());

    expect(
      positionalDeleteOrder(targetsAt([main, main]), "track"),
    ).toStrictEqual([0, 1]);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { failUnreplacedEntries } from "../plans/replaced-entries.ts";

interface Entry {
  name: string;
  ok?: false;
  detail?: string;
}

const failed = (entry: Entry): boolean => entry.ok === false;
const unwritten = (entry: Entry, detail: string): Entry => ({
  name: entry.name,
  ok: false,
  detail,
});

describe("failUnreplacedEntries", () => {
  it("leaves an overridden entry alone when its replacement landed", () => {
    const entries: Entry[] = [
      { name: "a", detail: "named again later in this call" },
      { name: "a" },
    ];

    expect(
      failUnreplacedEntries(
        entries,
        new Map([[0, { index: 1, by: '"a"' }]]),
        failed,
        unwritten,
      ),
    ).toStrictEqual(entries);
  });

  it("fails an overridden entry when its replacement failed", () => {
    const entries: Entry[] = [
      { name: "a", detail: "named again later in this call" },
      { name: "a", ok: false, detail: "no" },
    ];

    expect(
      failUnreplacedEntries(
        entries,
        new Map([[0, { index: 1, by: '"a"' }]]),
        failed,
        unwritten,
      ),
    ).toStrictEqual([
      {
        name: "a",
        ok: false,
        detail: 'not written: "a" was meant to replace it, but failed',
      },
      entries[1],
    ]);
  });

  it("follows a chain from the last entry back", () => {
    const entries: Entry[] = [
      { name: "a", detail: "x" },
      { name: "a", detail: "x" },
      { name: "a", ok: false, detail: "no" },
    ];
    const settled = failUnreplacedEntries(
      entries,
      new Map([
        [0, { index: 1, by: "first-hop" }],
        [1, { index: 2, by: "last-hop" }],
      ]),
      failed,
      unwritten,
    );

    expect(settled.map((entry) => entry.detail)).toStrictEqual([
      "not written: first-hop was meant to replace it, but failed",
      "not written: last-hop was meant to replace it, but failed",
      "no",
    ]);
  });

  it("does not change the list it was given", () => {
    const entries: Entry[] = [{ name: "a" }, { name: "a", ok: false }];

    failUnreplacedEntries(
      entries,
      new Map([[0, { index: 1, by: "a" }]]),
      failed,
      unwritten,
    );

    expect(entries[0]).toStrictEqual({ name: "a" });
  });
});

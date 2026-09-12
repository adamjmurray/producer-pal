// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { warnBlankTarget } from "#src/tools/shared/validation/lists/target-lists.ts";

describe("warnBlankTarget", () => {
  it("names the blank param and the one that carried the call", () => {
    warnBlankTarget({ id: "   ", path: "t1/s1" }, "clips", 1);

    expect(capturedWarnings()).toStrictEqual([
      'blank id ignored — "path" names the clips',
    ]);
  });

  it("says it the other way round too", () => {
    warnBlankTarget({ id: "123", path: "   " }, "clips", 1);

    expect(capturedWarnings()).toStrictEqual([
      'blank path ignored — "id" names the clips',
    ]);
  });

  // Both halves are reported by the spelling the caller wrote: a warning naming
  // "id" for a call that only ever said "ids" points at a param that isn't
  // there.
  it("reports the alias the caller wrote on the blank side", () => {
    warnBlankTarget({ ids: "   ", path: "t1/s1" }, "clips", 1);

    expect(capturedWarnings()).toStrictEqual([
      'blank ids ignored — "path" names the clips',
    ]);
  });

  it("reports the alias the caller wrote on the carrying side", () => {
    warnBlankTarget({ id: "   ", paths: "t1/s1" }, "clips", 1);

    expect(capturedWarnings()).toStrictEqual([
      'blank id ignored — "paths" names the clips',
    ]);
  });

  it("reports both aliases at once", () => {
    warnBlankTarget({ paths: "   ", ids: "123" }, "clips", 1);

    expect(capturedWarnings()).toStrictEqual([
      'blank paths ignored — "ids" names the clips',
    ]);
  });

  it("takes the noun from the tool", () => {
    warnBlankTarget({ id: "   ", path: "t1" }, "tracks", 1);

    expect(capturedWarnings()).toStrictEqual([
      'blank id ignored — "path" names the tracks',
    ]);
  });

  it.each([
    ["only one side was sent", { path: "t1/s1" }],
    ["both sides name something", { id: "123", path: "t1/s1" }],
    ["both sides are blank", { id: "  ", path: "  " }],
    ["nothing was sent", {}],
    ["a blank canonical has a usable alias", { id: "  ", ids: "123" }],
  ])("says nothing when %s", (_label, targets) => {
    warnBlankTarget(targets, "clips", 1);

    expect(capturedWarnings()).toStrictEqual([]);
  });

  // The caller counts what resolved: a refused call, or one whose paths found
  // no clip, has nothing to say about which param named its targets.
  it("says nothing when no target resolved", () => {
    warnBlankTarget({ id: "   ", path: "t9/s9" }, "clips", 0);

    expect(capturedWarnings()).toStrictEqual([]);
  });

  // "null" is not blank: namedParam already warns that it names nothing, and a
  // second warning here would say the same thing in different words. This is
  // the case that a refactor of isBlank to paramNamesSomething would break
  // while every other test still passed.
  it('stays quiet for a coerced "null", which has its own warning', () => {
    warnBlankTarget({ id: "null", path: "t1/s1" }, "clips", 1);

    expect(capturedWarnings()).toStrictEqual([]);
  });
});

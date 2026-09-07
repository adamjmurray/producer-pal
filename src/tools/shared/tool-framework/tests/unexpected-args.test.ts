// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  unexpectedArgKeys,
  unexpectedArgsWarning,
} from "../unexpected-args.ts";

const SCHEMA = { path: z.string(), name: z.string().optional() };

describe("unexpectedArgKeys", () => {
  it("names the arguments the schema does not accept, in the order sent", () => {
    expect(
      unexpectedArgKeys({ nmae: "x", path: "t1", colour: "red" }, SCHEMA),
    ).toStrictEqual(["nmae", "colour"]);
  });

  it("names nothing when every argument is known", () => {
    expect(
      unexpectedArgKeys({ path: "t1", name: "Kick" }, SCHEMA),
    ).toStrictEqual([]);
  });

  // The route refuses these before calling in, so the guard is the second line
  // of defense. Reporting "0, 1" as params a caller sent is worse than silence.
  it.each([
    ["an array", [1, 2]],
    ["a string", "path"],
    ["null", null],
    ["undefined", undefined],
  ])("reports nothing for %s", (_label, args) => {
    expect(unexpectedArgKeys(args, SCHEMA)).toStrictEqual([]);
  });
});

describe("unexpectedArgsWarning", () => {
  it("names every ignored argument in one warning", () => {
    expect(unexpectedArgsWarning(["nmae", "colour"])).toBe(
      "WARNING: ignored unexpected argument(s): nmae, colour",
    );
  });

  it("says nothing when nothing was unexpected", () => {
    expect(unexpectedArgsWarning([])).toBeUndefined();
  });
});

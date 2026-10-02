// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { nameEntries } from "#src/tools/shared/helpers/target-entries.ts";
import { labelNewTargets } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import {
  everyEntry,
  splitList,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { pairParams } from "#src/tools/shared/validation/lists/paired-values.ts";
import { splitEntries } from "#src/tools/shared/validation/lists/split-entries.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";

const LABELS = {
  param: "sendReturn",
  noun: "return",
  item: "track",
  shortfall: "kept their sends",
};

/**
 * Every shared reader a tool splits a text list through, each reading the
 * value against two targets. A tool that splits a text list its own way
 * belongs here too, or it can drift from `\,`.
 */
const READERS: Array<[string, (value: string) => unknown]> = [
  // name, on every create and update tool
  [
    "labelNewTargets",
    (value) => {
      const { parsedNames } = labelNewTargets({
        noun: "clip",
        param: "path",
        count: 2,
        name: value,
      });

      return [0, 1].map((i) => getNameForIndex(value, i, parsedNames));
    },
  ],
  // color, timeSignature, sampleFile, device, arrangementLength, locatorName
  // on create and rename
  [
    "splitList",
    (value) => {
      const parsed = splitList(value, 2, "sampleFile");

      return [0, 1].map((i) => valueForIndex(value, i, parsed));
    },
  ],
  // routing, sendReturn, preset, update-clip value lists
  [
    "pairParams",
    (value) => {
      const at = pairParams({ sendReturn: value }, { sendReturn: LABELS }, 2);

      return [0, 1].map((i) => at(i).sendReturn);
    },
  ],
  // values checked before any write: update-clip, update-device
  ["everyEntry", (value) => everyEntry(value, 2, "quantizePitch")],
  // locatorName on delete, where each name is a target
  ["nameEntries", (value) => nameEntries(value, "locatorName")],
];

describe.each(READERS)("%s", (_reader, read) => {
  it("splits a list only at a comma not written \\,", () => {
    const warn = vi.spyOn(console, "warn");
    const entries = read("A,Verse\\, part 2");

    expect(entries).toStrictEqual(["A", "Verse, part 2"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("reads \\, as a comma in a whole value", () => {
    const entries = read("Verse\\, part 2") as string[];

    expect(new Set(entries)).toStrictEqual(new Set(["Verse, part 2"]));
  });

  it("leaves any other backslash alone", () => {
    const entries = read("C:\\a.wav,C:\\b.wav");

    expect(entries).toStrictEqual(["C:\\a.wav", "C:\\b.wav"]);
  });
});

describe("splitEntries", () => {
  it.each([
    ["A\\,", ["A,"]],
    ["A\\,\\,B", ["A,,B"]],
    ["A\\\\,B", ["A\\,B"]],
  ])("splits %s", (value, expected) => {
    expect(splitEntries(value)).toStrictEqual(expected);
  });
});

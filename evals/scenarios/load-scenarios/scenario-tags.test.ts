// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { listScenarioSummaries } from "./load-scenarios.ts";
import { parseTagArgs, SCENARIO_TAGS } from "./scenario-tags.ts";

const summaries = listScenarioSummaries();

describe("scenario tags", () => {
  it("gives every scenario at least one tag", () => {
    const untagged = summaries
      .filter((s) => s.tags.length === 0)
      .map((s) => s.id);

    expect(untagged).toStrictEqual([]);
  });

  it("only uses declared tags", () => {
    const declared = new Set<string>(SCENARIO_TAGS);
    const undeclared = summaries.flatMap((s) =>
      s.tags
        .filter((tag) => !declared.has(tag))
        .map((tag) => `${s.id}: ${tag}`),
    );

    expect(undeclared).toStrictEqual([]);
  });

  it("declares no tag that nothing carries", () => {
    const used = new Set(summaries.flatMap((s) => s.tags));
    const unused = SCENARIO_TAGS.filter((tag) => !used.has(tag));

    expect(unused).toStrictEqual([]);
  });

  it("keeps the declared tags sorted and unique", () => {
    expect([...SCENARIO_TAGS]).toStrictEqual(
      [...new Set(SCENARIO_TAGS)].toSorted(),
    );
  });
});

describe("parseTagArgs", () => {
  it("splits comma lists across repeated flags and dedupes", () => {
    expect(parseTagArgs(["paths,clips", " context ", "paths"])).toStrictEqual([
      "paths",
      "clips",
      "context",
    ]);
  });

  it("returns nothing when the flag was never passed", () => {
    expect(parseTagArgs([])).toStrictEqual([]);
  });

  it.each([[[""]], [[" , "]], [["paths", ""]]])(
    "rejects an empty tag in %j instead of running everything",
    (values) => {
      expect(() => parseTagArgs(values)).toThrow(/--tag needs a tag name/);
    },
  );

  it("rejects a tag no scenario could carry", () => {
    expect(() => parseTagArgs(["notaton"])).toThrow(
      /Unknown tag\(s\): notaton/,
    );
  });
});

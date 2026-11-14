// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type PluginItem } from "../../../library-types.ts";
import { filterPlugins } from "../../../query/plugins/filter-plugins.ts";

const known: PluginItem = {
  name: "Reverb One",
  vendor: "Acme",
  version: "1.0",
  format: "VST3",
  category: "audiofx",
  subcategories: ["Reverb"],
};
const unknown: PluginItem = {
  name: "Reverb Two",
  vendor: "Acme",
  version: null,
  format: "VST3",
  category: null,
  subcategories: [],
};

describe("filterPlugins", () => {
  it("counts unknown-category plug-ins a category filter left out", () => {
    const result = filterPlugins([known, unknown], { category: "audiofx" });

    expect(result.matches).toStrictEqual([known]);
    expect(result.unknownCategoryLeftOut).toBe(1);
  });

  it("counts them for a subcategory filter too", () => {
    const result = filterPlugins([known, unknown], { subcategory: "reverb" });

    expect(result.matches).toStrictEqual([known]);
    expect(result.unknownCategoryLeftOut).toBe(1);
  });

  it("counts a plug-in once when both category and subcategory filters leave it out", () => {
    const result = filterPlugins([known, unknown], {
      category: "audiofx",
      subcategory: "reverb",
    });

    expect(result.matches).toStrictEqual([known]);
    expect(result.unknownCategoryLeftOut).toBe(1);
  });

  it("counts none when there is no category or subcategory filter", () => {
    const result = filterPlugins([known, unknown], { query: "reverb" });

    expect(result.matches).toStrictEqual([known, unknown]);
    expect(result.unknownCategoryLeftOut).toBe(0);
  });

  it("counts none when nothing unknown was left out", () => {
    const result = filterPlugins([known], { category: "audiofx" });

    expect(result.unknownCategoryLeftOut).toBe(0);
  });

  it.each([
    { label: "query", args: { query: "nothing" } },
    { label: "vendor", args: { vendor: "other" } },
    { label: "format", args: { format: "AU" as const } },
  ])("does not count a $label mismatch", ({ args }) => {
    const result = filterPlugins([known, unknown], {
      ...args,
      category: "audiofx",
    });

    expect(result.unknownCategoryLeftOut).toBe(0);
  });

  it("does not count a plug-in with a known category that doesn't match", () => {
    const result = filterPlugins([known], { category: "instrument" });

    expect(result.unknownCategoryLeftOut).toBe(0);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { groupParams, knobPages, uniqueNames } from "./plugin-param-groups.ts";

const au = [
  { groups: ["global", "main"], name: "Output" },
  { groups: ["global", "ENV1"], name: "Attack" },
  { groups: ["global", "ENV1"], name: "Env1 Shape" },
  { groups: ["global", "ENV2"], name: "Attack" },
  { groups: ["global", "ENV2"], name: "Env2 Shape" },
];
const params = [
  { index: 1, name: "Output" },
  { index: 2, name: "Env1 Shape" },
  { index: 3, name: "Attack" },
  { index: 4, name: "Attack" },
  { index: 5, name: "Env2 Shape" },
  { index: 6, name: "Bypass" },
];

describe("groupParams", () => {
  it("drops shared outer groups and places repeats by their neighbours", () => {
    expect(groupParams(params, au).map((p) => p.group)).toStrictEqual([
      "main",
      "ENV1",
      "ENV1",
      "ENV2",
      "ENV2",
      "",
    ]);
  });
});

describe("uniqueNames", () => {
  it("puts the group in front of repeated names and keeps the short label", () => {
    const named = uniqueNames(groupParams(params, au));

    expect(named.map((p) => p.name)).toStrictEqual([
      "Output",
      "Env1 Shape",
      "ENV1 Attack",
      "ENV2 Attack",
      "Env2 Shape",
      "Bypass",
    ]);
    expect(named[2]?.label).toBe("Attack");
  });

  it("numbers repeats it can't tell apart", () => {
    const named = uniqueNames([
      { index: 1, name: "Mod Wheel" },
      { index: 2, name: "Mod Wheel" },
    ]);

    expect(named.map((p) => p.name)).toStrictEqual([
      "Mod Wheel",
      "Mod Wheel (2)",
    ]);
  });
});

describe("knobPages", () => {
  it("gives each group its pages of 16, and ungrouped params Main", () => {
    const osc = Array.from({ length: 20 }, (_, i) => ({
      index: i + 2,
      name: `Osc ${i}`,
      group: "OSC",
    }));

    expect(
      knobPages([{ index: 1, name: "Output", group: "" }, ...osc]),
    ).toStrictEqual([
      { name: "Main", first: 1, count: 1 },
      { name: "OSC 1/2", first: 2, count: 16 },
      { name: "OSC 2/2", first: 18, count: 4 },
    ]);
  });
});

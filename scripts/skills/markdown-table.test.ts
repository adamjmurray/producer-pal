// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { markdownTable } from "./markdown-table.ts";

describe("markdownTable", () => {
  it("pads every cell to its column's widest value", () => {
    const table = markdownTable(
      ["Fragment", "Chars"],
      [
        ["library", "3005"],
        ["specialized-devices", "3004"],
      ],
    );

    expect(table.split("\n")).toStrictEqual([
      "| Fragment            | Chars |",
      "| ------------------- | ----- |",
      "| library             | 3005  |",
      "| specialized-devices | 3004  |",
    ]);
  });

  it("carries alignment into the separator and the padding", () => {
    const table = markdownTable(
      ["left", "right", "mid"],
      [["a", "b", "c"]],
      ["left", "right", "center"],
    );

    expect(table.split("\n")).toStrictEqual([
      "| left | right | mid |",
      "| ---- | ----: | :-: |",
      "| a    |     b |  c  |",
    ]);
  });

  it("keeps rows aligned when cells hold the report's ✓/– marks", () => {
    // The gate matrix is mostly these two; a miscount here misaligns every row.
    const lines = markdownTable(
      ["Fragment", "all"],
      [
        ["library", "✓"],
        ["devices", "–"],
      ],
      ["left", "center"],
    ).split("\n");

    expect(new Set(lines.map((line) => line.length))).toStrictEqual(
      new Set([lines[0]?.length]),
    );
  });

  it("holds a column open wide enough for its separator", () => {
    const table = markdownTable(["a"], [["b"]]);

    expect(table).toBe("| a   |\n| --- |\n| b   |");
  });

  it("fills in for a row with missing trailing cells", () => {
    const table = markdownTable(["a", "b"], [["only"]]);

    expect(table.split("\n").at(-1)).toBe("| only |     |");
  });
});

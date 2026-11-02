// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { shareOptionLists } from "../param-option-lists.ts";

const WAVES = ["Sine", "Saw", "Square"];
const MODES = ["Low", "High", "Sync"];

describe("shareOptionLists", () => {
  it("replaces a list two params share with a key, in order of first use", () => {
    const params: Record<string, unknown>[] = [
      { name: "Mode A", value: "Low", options: MODES },
      { name: "Wave A", value: "Sine", options: WAVES },
      { name: "Wave B", value: "Saw", options: [...WAVES] },
      { name: "Mode B", value: "High", options: [...MODES] },
    ];

    expect(shareOptionLists(params)).toStrictEqual({ L1: MODES, L2: WAVES });
    expect(params).toStrictEqual([
      { name: "Mode A", value: "Low", optionList: "L1" },
      { name: "Wave A", value: "Sine", optionList: "L2" },
      { name: "Wave B", value: "Saw", optionList: "L2" },
      { name: "Mode B", value: "High", optionList: "L1" },
    ]);
  });

  it("leaves a list one param uses on that param", () => {
    const params: Record<string, unknown>[] = [
      { name: "Wave", value: "Sine", options: WAVES },
      { name: "Gain", value: 0 },
    ];

    expect(shareOptionLists(params)).toBeUndefined();
    expect(params[0]).toStrictEqual({
      name: "Wave",
      value: "Sine",
      options: WAVES,
    });
  });

  it("leaves a short list on its params even when they share it", () => {
    const params: Record<string, unknown>[] = [
      { name: "A", value: "Low", options: ["Low", "High"] },
      { name: "B", value: "High", options: ["Low", "High"] },
    ];

    expect(shareOptionLists(params)).toBeUndefined();
    expect(params[0]).toHaveProperty("options", ["Low", "High"]);
  });

  it("tells lists apart by order and by number versus text", () => {
    const params: Record<string, unknown>[] = [
      { name: "A", value: "x", options: ["x", "y", "z"] },
      { name: "B", value: "z", options: ["z", "y", "x"] },
      { name: "C", value: "1", options: ["1", "2", "3"] },
      { name: "D", value: 1, options: [1, 2, 3] },
    ];

    expect(shareOptionLists(params)).toBeUndefined();
  });

  it("does nothing for params with no options", () => {
    expect(shareOptionLists([{ name: "Gain", value: 0 }])).toBeUndefined();
    expect(shareOptionLists([])).toBeUndefined();
  });
});

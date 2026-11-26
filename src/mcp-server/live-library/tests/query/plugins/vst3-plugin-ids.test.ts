// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { vst3PluginIds } from "../../../query/plugins/vst3-plugin-ids.ts";

describe("vst3PluginIds", () => {
  // The first of each is what Max 9 on Windows lists for Serum 2.1.5.
  it("gives the id Max knows the plug-in by, then the unswapped one", () => {
    expect(
      vst3PluginIds("device:vst3:instr:56534558-6673-5073-6572-756d20320000"),
    ).toStrictEqual([1335155447, 71194871]);
    expect(
      vst3PluginIds("device:vst3:audiofx:56534558-6673-5173-6572-756d20322066"),
    ).toStrictEqual([-472297922, -125317540]);
  });

  it("gives one id when both byte orders hash the same", () => {
    expect(vst3PluginIds(`device:vst3:instr:${"0".repeat(32)}`)).toStrictEqual([
      0,
    ]);
  });

  it("gives none without a class id", () => {
    expect(vst3PluginIds(null)).toStrictEqual([]);
    expect(vst3PluginIds("device:vst3:instr:c")).toStrictEqual([]);
  });
});

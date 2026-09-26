// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { audioClipParams } from "../audio-clip-params.ts";

describe("audioClipParams", () => {
  it("publishes gain, pitch shift and warp mode", () => {
    expect(Object.keys(audioClipParams())).toStrictEqual([
      "gainDb",
      "pitchShift",
      "warpMode",
    ]);
  });

  it("coerces numbers and holds them to Live's ranges", () => {
    const { gainDb, pitchShift } = audioClipParams();

    expect(gainDb!.parse("-70")).toBe(-70);
    expect(() => gainDb!.parse(25)).toThrow(/expected number to be <=24/);
    expect(pitchShift!.parse("-48")).toBe(-48);
    expect(() => pitchShift!.parse(49)).toThrow(/expected number to be <=48/);
  });

  it("accepts only Live's warp modes", () => {
    const { warpMode } = audioClipParams();

    expect(warpMode!.parse("repitch")).toBe("repitch");
    expect(() => warpMode!.parse("bounce")).toThrow(/Invalid option/);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { type StateAssertion } from "../../../types.ts";
import { devicePresetSwapByName } from "./device-preset-swap-by-name.ts";

const state = devicePresetSwapByName.assertions.find(
  (a) => a.type === "state",
) as StateAssertion;

const explain = (devices: unknown[]): string =>
  state.explain?.({ devices }) ?? "";

describe("device-preset-swap-by-name failure text", () => {
  it("says none when there are no Drum Racks", () => {
    expect(explain([])).toMatch(/Drum Racks are: none$/);
  });

  it("marks an unnamed Drum Rack instead of saying none", () => {
    expect(explain([{ type: "drum-rack" }])).toMatch(
      /Drum Racks are: \(unnamed\)$/,
    );
  });

  it("quotes named Drum Racks and ignores other devices", () => {
    expect(
      explain([
        { type: "drum-rack", name: "Kit" },
        { type: "drum-rack" },
        { type: "utility", name: "Utility" },
      ]),
    ).toMatch(/Drum Racks are: "Kit", \(unnamed\)$/);
  });
});

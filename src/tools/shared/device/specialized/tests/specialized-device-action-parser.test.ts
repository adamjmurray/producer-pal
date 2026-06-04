// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseAction } from "../specialized-device-action-parser.ts";

describe("parseAction", () => {
  it("parses a bare action name with no args", () => {
    expect(parseAction("reverse")).toStrictEqual({ name: "reverse", args: [] });
  });

  it("trims surrounding whitespace", () => {
    expect(parseAction("  crop  ")).toStrictEqual({ name: "crop", args: [] });
  });

  it("parses empty parentheses as no args", () => {
    expect(parseAction("reverse()")).toStrictEqual({
      name: "reverse",
      args: [],
    });
  });

  it("parses an integer arg", () => {
    expect(parseAction("warpAs(4)")).toStrictEqual({
      name: "warpAs",
      args: [4],
    });
  });

  it("parses a float arg", () => {
    expect(parseAction("warpAs(4.5)")).toStrictEqual({
      name: "warpAs",
      args: [4.5],
    });
  });

  it("parses a negative float arg", () => {
    expect(parseAction("setAmount(-0.25)")).toStrictEqual({
      name: "setAmount",
      args: [-0.25],
    });
  });

  it("parses leading-dot floats", () => {
    expect(parseAction("setAmount(.5)")).toStrictEqual({
      name: "setAmount",
      args: [0.5],
    });
  });

  it("parses single-quoted string args", () => {
    expect(parseAction("addModulationTarget('Filter 1 Freq')")).toStrictEqual({
      name: "addModulationTarget",
      args: ["Filter 1 Freq"],
    });
  });

  it("parses double-quoted string args", () => {
    expect(parseAction('addModulationTarget("Osc 1 Pos")')).toStrictEqual({
      name: "addModulationTarget",
      args: ["Osc 1 Pos"],
    });
  });

  it("parses mixed string and number args", () => {
    expect(
      parseAction("setModulation('Osc 1 Pos', 'Env 2', 0.5)"),
    ).toStrictEqual({
      name: "setModulation",
      args: ["Osc 1 Pos", "Env 2", 0.5],
    });
  });

  it("respects commas inside quoted strings", () => {
    expect(parseAction("setLabel('a, b, c')")).toStrictEqual({
      name: "setLabel",
      args: ["a, b, c"],
    });
  });

  it("preserves whitespace inside quoted strings", () => {
    expect(parseAction("setName('  spaced  ')")).toStrictEqual({
      name: "setName",
      args: ["  spaced  "],
    });
  });

  it("accepts bare unquoted words as string args", () => {
    expect(parseAction("setMode(serial)")).toStrictEqual({
      name: "setMode",
      args: ["serial"],
    });
  });

  it("returns null for an empty string", () => {
    expect(parseAction("")).toBeNull();
  });

  it("returns null when the name starts with a digit", () => {
    expect(parseAction("1bad()")).toBeNull();
  });

  it("returns null for an unterminated quote", () => {
    expect(parseAction("setName('unterminated)")).toBeNull();
  });

  it("returns null for a trailing comma (empty arg)", () => {
    expect(parseAction("setModulation('a',)")).toBeNull();
  });

  it("returns null for a leading comma (empty arg)", () => {
    expect(parseAction("setModulation(,'a')")).toBeNull();
  });

  it("returns null for a mismatched quote pair", () => {
    expect(parseAction("setName('a\")")).toBeNull();
  });
});

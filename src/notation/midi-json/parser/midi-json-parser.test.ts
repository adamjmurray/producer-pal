// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parse } from "#src/notation/midi-json/parser/midi-json-parser.ts";

describe("MIDI JSON parser", () => {
  describe("keys", () => {
    it("parses bare short keys", () => {
      expect(parse("[{p:60,t:0,d:4,v:100,vd:10,c:0.75}]")).toStrictEqual([
        { p: 60, t: 0, d: 4, v: 100, vd: 10, c: 0.75 },
      ]);
    });

    it("parses double-quoted keys", () => {
      expect(parse('[{"p":60,"t":0}]')).toStrictEqual([{ p: 60, t: 0 }]);
    });

    it("parses single-quoted keys", () => {
      expect(parse("[{'p':60,'t':0}]")).toStrictEqual([{ p: 60, t: 0 }]);
    });

    it("parses long-form keys", () => {
      expect(
        parse(
          "[{pitch:60,start:0,duration:1,velocity:90,velocityDeviation:5,probability:0.5}]",
        ),
      ).toStrictEqual([
        {
          pitch: 60,
          start: 0,
          duration: 1,
          velocity: 90,
          velocityDeviation: 5,
          probability: 0.5,
        },
      ]);
    });

    it("accepts digits after the first key character", () => {
      expect(parse("[{p1:60}]")).toStrictEqual([{ p1: 60 }]);
    });

    it("keeps the last value when a key repeats", () => {
      expect(parse("[{p:60,p:62}]")).toStrictEqual([{ p: 62 }]);
    });
  });

  describe("numbers", () => {
    it("parses ratios as exact floats", () => {
      expect(parse("[{d:2/3,t:1/3}]")).toStrictEqual([{ d: 2 / 3, t: 1 / 3 }]);
    });

    it("parses a negative ratio", () => {
      expect(parse("[{vd:-1/2}]")).toStrictEqual([{ vd: -0.5 }]);
    });

    it("parses leading-dot decimals", () => {
      expect(parse("[{c:.5,vd:-.75}]")).toStrictEqual([{ c: 0.5, vd: -0.75 }]);
    });

    it("parses negative numbers", () => {
      expect(parse("[{vd:-10}]")).toStrictEqual([{ vd: -10 }]);
    });

    it("parses exponents in every sign form", () => {
      expect(parse("[{a:1e2,b:1E2,c:1e+2,d:1e-2}]")).toStrictEqual([
        { a: 100, b: 100, c: 100, d: 0.01 },
      ]);
    });

    it("parses leading zeros", () => {
      expect(parse("[{p:007}]")).toStrictEqual([{ p: 7 }]);
    });
  });

  describe("whitespace and empties", () => {
    it("parses an empty array", () => {
      expect(parse("[]")).toStrictEqual([]);
      expect(parse("  [ ]  ")).toStrictEqual([]);
    });

    it("parses an empty object", () => {
      expect(parse("[{}]")).toStrictEqual([{}]);
      expect(parse("[{ }]")).toStrictEqual([{}]);
    });

    it("ignores whitespace anywhere between tokens", () => {
      expect(
        parse("\n\t [ { p : 60 , t : 0 } ,\r\n { p : 62 } ] \n"),
      ).toStrictEqual([{ p: 60, t: 0 }, { p: 62 }]);
    });
  });

  describe("syntax errors", () => {
    const cases: [name: string, input: string, message: RegExp][] = [
      ["a trailing comma in the array", "[{p:60},]", /expected `\{`/],
      ["a trailing comma in an object", "[{p:60,}]", /expected a key/],
      ["a string value", '[{p:"60"}]', /expected a number/],
      ["a nested object", "[{p:{q:1}}]", /expected a number/],
      ["a missing colon", "[{p 60}]", /expected `:`/],
      ["an unterminated array", "[{p:60}", /expected `\]`/],
      ["an unterminated object", "[{p:60", /expected `\}`/],
      ["an unterminated quoted key", "[{'p:60}]", /expected `'`/],
      ["garbage after the array", "[] junk", /expected end of input/],
      ["a non-array", "{p:60}", /expected `\[`/],
      ["plain garbage", "not json", /expected `\[`/],
      ["an empty string", "", /expected `\[`/],
      ["a dangling decimal point", "[{p:1.}]", /expected `\}`/],
      ["a dangling exponent", "[{p:1e}]", /expected `\}`/],
      ["a non-numeric denominator", "[{d:2/x}]", /expected `\}`/],
      ["a bare minus sign", "[{p:-}]", /expected a number/],
    ];

    it.each(cases)("rejects %s", (_name, input, message) => {
      expect(() => parse(input)).toThrow(message);
    });

    it("names the position and what it found", () => {
      expect(() => parse("[{p:x}]")).toThrow(
        "expected a number at position 4, found `x`",
      );
    });

    it("says end of input when the string runs out", () => {
      expect(() => parse("[{p:")).toThrow(
        "expected a number at position 4, found end of input",
      );
    });
  });
});

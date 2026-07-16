// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { parseCompactJSLiteral } from "#src/shared/compact/compact-parser.ts";
import { toCompactJSLiteral } from "#src/shared/compact/compact-serializer.ts";

describe("parseCompactJSLiteral - primitives", () => {
  it("parses strings", () => {
    expect(parseCompactJSLiteral('"hello"')).toBe("hello");
    expect(parseCompactJSLiteral('""')).toBe("");
  });

  it("parses numbers", () => {
    expect(parseCompactJSLiteral("42")).toBe(42);
    expect(parseCompactJSLiteral("0")).toBe(0);
    expect(parseCompactJSLiteral("3.14")).toBe(3.14);
    expect(parseCompactJSLiteral("-100")).toBe(-100);
    expect(parseCompactJSLiteral("-3.5")).toBe(-3.5);
    expect(parseCompactJSLiteral("1e21")).toBe(1e21);
    expect(parseCompactJSLiteral("1.5e-3")).toBe(1.5e-3);
  });

  it("parses booleans and null", () => {
    expect(parseCompactJSLiteral("true")).toBe(true);
    expect(parseCompactJSLiteral("false")).toBe(false);
    expect(parseCompactJSLiteral("null")).toBe(null);
  });
});

describe("parseCompactJSLiteral - arrays", () => {
  it("parses empty arrays", () => {
    expect(parseCompactJSLiteral("[]")).toStrictEqual([]);
  });

  it("parses flat arrays", () => {
    expect(parseCompactJSLiteral("[1,2,3]")).toStrictEqual([1, 2, 3]);
    expect(parseCompactJSLiteral('["a","b"]')).toStrictEqual(["a", "b"]);
    expect(parseCompactJSLiteral("[true,false,null,0]")).toStrictEqual([
      true,
      false,
      null,
      0,
    ]);
  });

  it("parses nested arrays", () => {
    expect(parseCompactJSLiteral("[[1,2],[3,4]]")).toStrictEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(parseCompactJSLiteral("[[[1,2]],[[3,4]]]")).toStrictEqual([
      [[1, 2]],
      [[3, 4]],
    ]);
  });
});

describe("parseCompactJSLiteral - objects", () => {
  it("parses empty objects", () => {
    expect(parseCompactJSLiteral("{}")).toStrictEqual({});
  });

  it("parses objects with unquoted identifier keys", () => {
    expect(parseCompactJSLiteral("{a:1}")).toStrictEqual({ a: 1 });
    expect(parseCompactJSLiteral('{name:"test",flag:true}')).toStrictEqual({
      name: "test",
      flag: true,
    });
    expect(parseCompactJSLiteral("{_priv:1,$dollar:2,a1b2:3}")).toStrictEqual({
      _priv: 1,
      $dollar: 2,
      a1b2: 3,
    });
  });

  it("parses bare integer keys (which JSON5 cannot)", () => {
    expect(parseCompactJSLiteral('{0:"zero"}')).toStrictEqual({ 0: "zero" });
    expect(parseCompactJSLiteral('{123:"v",0:"z"}')).toStrictEqual({
      123: "v",
      0: "z",
    });
  });

  it("parses quoted non-identifier keys", () => {
    expect(parseCompactJSLiteral('{"my-key":1}')).toStrictEqual({
      "my-key": 1,
    });
    expect(parseCompactJSLiteral('{"a.b":1,"1.5":2,"-1":3}')).toStrictEqual({
      "a.b": 1,
      "1.5": 2,
      "-1": 3,
    });
    expect(parseCompactJSLiteral('{"":1}')).toStrictEqual({ "": 1 });
  });

  it("parses mixed quoted and unquoted keys", () => {
    expect(
      parseCompactJSLiteral('{42:true,name:"x","my-key":1}'),
    ).toStrictEqual({
      42: true,
      name: "x",
      "my-key": 1,
    });
  });

  it("parses nested objects", () => {
    expect(parseCompactJSLiteral("{a:{b:{c:42}}}")).toStrictEqual({
      a: { b: { c: 42 } },
    });
    expect(parseCompactJSLiteral("{items:[1,2,3],meta:{n:3}}")).toStrictEqual({
      items: [1, 2, 3],
      meta: { n: 3 },
    });
  });
});

describe("parseCompactJSLiteral - string values with structural characters", () => {
  it("does not mistake characters inside strings for syntax", () => {
    expect(
      parseCompactJSLiteral('{url:"http://x:8080/a,b{c}[d]"}'),
    ).toStrictEqual({
      url: "http://x:8080/a,b{c}[d]",
    });
    expect(parseCompactJSLiteral('{k:"a:b,c"}')).toStrictEqual({ k: "a:b,c" });
  });

  it("handles escaped quotes, newlines, tabs, and unicode escapes", () => {
    expect(parseCompactJSLiteral('"quote\\"in"')).toBe('quote"in');
    expect(parseCompactJSLiteral('"line\\nbreak"')).toBe("line\nbreak");
    expect(parseCompactJSLiteral('"tab\\there"')).toBe("tab\there");
    expect(parseCompactJSLiteral('"\\u00e9"')).toBe("é");
    expect(parseCompactJSLiteral('{"has\\"q":1}')).toStrictEqual({
      'has"q': 1,
    });
  });
});

describe("parseCompactJSLiteral - whitespace tolerance", () => {
  it("tolerates whitespace between tokens (not emitted by the serializer)", () => {
    expect(
      parseCompactJSLiteral("  { a : 1 , b : [ 1 , 2 ] }  "),
    ).toStrictEqual({
      a: 1,
      b: [1, 2],
    });
    expect(parseCompactJSLiteral("[ ]")).toStrictEqual([]);
    expect(parseCompactJSLiteral("{ }")).toStrictEqual({});
  });
});

describe("parseCompactJSLiteral - JSON superset compatibility", () => {
  it("parses plain JSON (all keys quoted) identically", () => {
    const json = '{"trackId":"t1","clips":[{"id":"c1","length":4}]}';

    expect(parseCompactJSLiteral(json)).toStrictEqual(JSON.parse(json));
  });
});

describe("parseCompactJSLiteral - round-trips with toCompactJSLiteral", () => {
  // JSON-representable corpus (no undefined: the serializer drops it, so it is
  // not round-trippable — mirrors the serializer test's documented lossiness).
  const corpus: unknown[] = [
    "hello",
    "",
    42,
    0,
    -3.14,
    true,
    false,
    null,
    [],
    {},
    [1, 2, 3],
    ["a", "b", "c"],
    [1, "text", true, false, null, 0],
    { a: 1, b: 0, c: false, d: null, e: "", f: [] },
    { trackId: "t1", sceneId: "s1", clipId: "c1" },
    { 0: "zero", 12: "twelve" },
    { "my-key": 1, "a.b": 2, name: "x" },
    {
      track: {
        id: "track_1",
        name: "Drums",
        mute: false,
        volume: 0,
        clips: [
          { id: "clip_1", length: 4, notes: "1|1 C3 v100" },
          { id: "clip_2", length: 8 },
        ],
      },
    },
    {
      scenes: [
        { name: "Scene 1", tempo: 120 },
        { name: "Scene 2", tempo: 140 },
      ],
      tracks: { count: 3, items: ["Track A", "Track B"] },
    },
    { a: { b: { c: { d: { e: { f: 42 } } } } } },
  ];

  for (const [i, value] of corpus.entries()) {
    it(`round-trips corpus[${i}]`, () => {
      expect(parseCompactJSLiteral(toCompactJSLiteral(value))).toStrictEqual(
        value,
      );
    });
  }
});

describe("parseCompactJSLiteral - prototype pollution guard", () => {
  it("stores a __proto__ key as own data, not the object's prototype", () => {
    const result = parseCompactJSLiteral("{__proto__:{polluted:1}}") as Record<
      string,
      unknown
    >;

    // Matches JSON.parse: the key round-trips as an own data property while the
    // prototype stays Object.prototype (a plain obj[key]= would mutate it).
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.hasOwn(result, "__proto__")).toBe(true);

    // The descriptor must be a plain writable/enumerable/configurable data
    // property — exactly what JSON.parse produces (and what obj[key]= cannot).
    const descriptor = Object.getOwnPropertyDescriptor(result, "__proto__");

    expect(descriptor).toMatchObject({
      writable: true,
      enumerable: true,
      configurable: true,
    });
    expect(descriptor?.value).toStrictEqual({ polluted: 1 });
  });

  it("does not pollute Object.prototype", () => {
    parseCompactJSLiteral("{__proto__:{polluted:1}}");

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("parseCompactJSLiteral - malformed input throws", () => {
  // Each case asserts the SPECIFIC failure reason, not just the shared
  // "Invalid compact literal:" wrapper — otherwise a blanked message (or a
  // guard that falls through to a different error) would slip past unnoticed.
  const cases: Array<[string, string, RegExp]> = [
    ["empty string", "", /unexpected token/],
    ["unterminated string", '"abc', /unterminated string/],
    ["trailing backslash", '"abc\\', /unterminated string/],
    ["missing colon", "{a 1}", /expected ':' after object key/],
    ["bad object key", "{:1}", /expected an object key/],
    ["unclosed object", "{a:1", /expected ',' or '}' in object/],
    ["unclosed array", "[1,2", /expected ',' or ']' in array/],
    ["trailing content", "{}x", /unexpected trailing content/],
    ["unexpected token", "{a:xyz}", /unexpected token/],
    ["invalid number", "-", /invalid number/],
    ["bare keyword typo", "tru", /unexpected token/],
  ];

  for (const [label, input, reason] of cases) {
    it(`throws on ${label}`, () => {
      expect(() => parseCompactJSLiteral(input)).toThrow(
        /invalid compact literal/i,
      );
      expect(() => parseCompactJSLiteral(input)).toThrow(reason);
    });
  }
});

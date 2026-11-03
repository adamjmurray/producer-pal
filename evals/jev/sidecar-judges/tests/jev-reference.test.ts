// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  errorsVsOthers,
  pairwiseAgreement,
  resolveReference,
  type Calls,
} from "../jev-reference.ts";

const vote = (slug: string, pass: boolean) => ({ slug, pass, issues: [] });

describe("resolveReference", () => {
  it("takes the strict majority", () => {
    const r = resolveReference([
      vote("a", true),
      vote("b", true),
      vote("c", false),
    ]);

    expect(r.majority).toBe(true);
    expect(r.unanimous).toBe(false);
    expect(
      resolveReference([vote("a", false), vote("b", false), vote("c", true)])
        .majority,
    ).toBe(false);
  });

  it("has no majority on a tie", () => {
    const r = resolveReference([vote("a", true), vote("b", false)]);

    expect(r.majority).toBeUndefined();
    expect(r.unanimous).toBe(false);
  });

  it("is unanimous when all votes match, including a single vote", () => {
    expect(
      resolveReference([vote("a", false), vote("b", false)]),
    ).toStrictEqual(
      expect.objectContaining({
        majority: false,
        unanimous: true,
      }),
    );
    expect(resolveReference([vote("a", true)])).toStrictEqual(
      expect.objectContaining({
        majority: true,
        unanimous: true,
      }),
    );
  });
});

describe("pairwiseAgreement", () => {
  const rows: Calls[] = [
    { a: true, b: true, jev: true },
    { a: true, b: false, jev: false },
    { a: false, b: false, jev: undefined },
    { a: false, b: undefined, jev: false },
  ];

  it("counts agreement over results where both made a call", () => {
    const out = pairwiseAgreement(rows, ["a", "b", "jev"]);

    expect(out).toStrictEqual([
      { a: "a", b: "b", n: 3, agree: 2, pct: (2 / 3) * 100 },
      { a: "a", b: "jev", n: 3, agree: 2, pct: (2 / 3) * 100 },
      { a: "b", b: "jev", n: 2, agree: 2, pct: 100 },
    ]);
  });

  it("gives null with no shared results", () => {
    expect(pairwiseAgreement([{ a: true }], ["a", "b"])[0]?.pct).toBeNull();
  });
});

describe("errorsVsOthers", () => {
  const rows: Calls[] = [
    { h: true, l: true, s: true, jev: false }, // all LLMs pass; jev wrong fail
    { h: false, l: false, s: false, jev: true }, // all fail; jev wrong pass
    { h: true, l: false, s: false, jev: false }, // h wrong pass vs l+s
    { h: false, l: true, s: true, jev: true }, // h wrong fail vs l+s
    { h: true, l: true, s: false, jev: undefined }, // split; jev escalated
  ];
  const out = errorsVsOthers(rows, ["h", "l", "s", "jev"], ["h", "l", "s"]);
  const by = (id: string) => out.find((o) => o.judge === id);

  it("scores a judge only where the other LLM judges agree", () => {
    expect(by("h")).toStrictEqual({
      judge: "h",
      n: 4,
      wrongPass: 1,
      wrongFail: 1,
    });
    expect(by("l")).toStrictEqual({
      judge: "l",
      n: 2,
      wrongPass: 0,
      wrongFail: 0,
    });
  });

  it("scores Jev against all LLM judges and skips its escalations", () => {
    expect(by("jev")).toStrictEqual({
      judge: "jev",
      n: 2,
      wrongPass: 1,
      wrongFail: 1,
    });
  });

  it("accepts a lone other judge as the reference", () => {
    const two = errorsVsOthers(
      [{ h: true, l: false }, { h: true, l: true }, { h: true }],
      ["h"],
      ["h", "l"],
    );

    expect(two[0]).toStrictEqual({
      judge: "h",
      n: 2,
      wrongPass: 1,
      wrongFail: 0,
    });
  });

  it("scores nothing without other voters", () => {
    expect(errorsVsOthers([{ h: true }], ["h"], ["h"])[0]?.n).toBe(0);
  });
});

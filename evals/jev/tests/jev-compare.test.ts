// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { parseArgs } from "../jev-compare.ts";

describe("parseArgs --via", () => {
  it("is unset by default", () => {
    expect(parseArgs([]).via).toBeUndefined();
  });

  it.each(["typesafe", "openrouter", "vercel"] as const)(
    "accepts %s",
    (route) => {
      expect(parseArgs([`--via=${route}`]).via).toBe(route);
    },
  );

  it("rejects an unknown route, naming the choices", () => {
    expect(() => parseArgs(["--via=nowhere"])).toThrow(
      "Unknown --via=nowhere; use one of typesafe, openrouter, vercel",
    );
  });

  it("does not treat the flag as a run id", () => {
    expect(parseArgs(["run-1", "--via=vercel"]).runIds).toStrictEqual([
      "run-1",
    ]);
  });
});

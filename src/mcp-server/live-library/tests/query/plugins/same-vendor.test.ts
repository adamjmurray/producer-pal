// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  distinctMakers,
  foldVendor,
  sameVendor,
} from "../../../query/plugins/same-vendor.ts";

describe("sameVendor", () => {
  it.each([
    ["Acme", "acme"],
    ["Acme Audio", "Acme"],
    ["Acme", " ACME Audio "],
    ["Acme-Audio", "Acme"],
  ])("matches %s and %s", (a, b) => {
    expect(sameVendor(a, b)).toBe(true);
  });

  it.each([
    ["Acme", "Acmetone"],
    ["Acme", "Beta"],
    ["Acme", null],
    ["", "Acme"],
    [undefined, undefined],
  ])("does not match %s and %s", (a, b) => {
    expect(sameVendor(a, b)).toBe(false);
  });
});

describe("distinctMakers", () => {
  it("counts spellings of one maker once, keeping the first", () => {
    expect(
      distinctMakers(["Acme Audio", "acme", "Beta", "Acmetone"]),
    ).toStrictEqual(["Acme Audio", "Beta", "Acmetone"]);
  });
});

describe("foldVendor", () => {
  it("lowercases and trims, and has nothing for none", () => {
    expect(foldVendor(" Acme ")).toBe("acme");
    expect(foldVendor(null)).toBeUndefined();
  });
});

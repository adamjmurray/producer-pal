// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { rackChainsProblem } from "./rack-chains.ts";

describe("rackChainsProblem", () => {
  it("accepts Mid empty and Side holding one device", () => {
    expect(
      rackChainsProblem({
        chains: [
          { path: "t1/d0/c0", name: "Mid", deviceCount: 0 },
          { path: "t1/d0/c1", name: "Side", deviceCount: 1 },
        ],
      }),
    ).toBeNull();
  });

  it("reads a chain with no deviceCount as empty", () => {
    expect(
      rackChainsProblem({ chains: [{ name: "Mid" }, { name: "Side" }] }),
    ).toBe("chains (name:devices) read Mid:0, Side:0, wanted Mid:0, Side:1");
  });

  it("names a third chain", () => {
    expect(
      rackChainsProblem({
        chains: [
          { name: "Mid", deviceCount: 0 },
          { name: "Side", deviceCount: 1 },
          { name: "Chain", deviceCount: 1 },
        ],
      }),
    ).toMatch(/Chain:1/);
  });

  it("names a read with no chains", () => {
    expect(rackChainsProblem({})).toMatch(/read none/);
  });
});

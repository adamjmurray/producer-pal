// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { errorWithChainsLeft, withChainsLeft } from "../chains-left.ts";

describe("withChainsLeft", () => {
  it("leaves the reason alone when nothing was made", () => {
    expect(withChainsLeft("no room", undefined)).toBe("no room");
    expect(withChainsLeft("no room", "")).toBe("no room");
  });

  it("counts the chains made", () => {
    expect(withChainsLeft("no room", "c1")).toBe(
      "no room; left an empty chain: c1",
    );
    expect(withChainsLeft("no room", "c1-c3, c0")).toBe(
      "no room; left 4 empty chains: c1-c3, c0",
    );
  });
});

describe("errorWithChainsLeft", () => {
  it("passes an Error through when nothing was made", () => {
    const error = new Error("boom");

    expect(errorWithChainsLeft(error, undefined)).toBe(error);
  });

  it("wraps a thrown non-Error when nothing was made", () => {
    const result = errorWithChainsLeft("boom", "");

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("boom");
  });

  it("names the chains made, keeping the cause", () => {
    const error = new Error("boom");
    const result = errorWithChainsLeft(error, "c2");

    expect(result.message).toBe("boom; left an empty chain: c2");
    expect(result.cause).toBe(error);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { splitRequirements } from "../jev-requirements.ts";

describe("splitRequirements", () => {
  it("returns no items for a prompt without a numbered list", () => {
    const r = splitRequirements("The reply must mention track 20.");

    expect(r.items).toStrictEqual([]);
    expect(r.context).toBe("The reply must mention track 20.");
    expect(r.trailer).toBe("");
  });

  it("splits context, items and trailer", () => {
    const r = splitRequirements(
      [
        "Evaluate the reply:",
        "1. It says track 20 is missing.",
        "2. It does NOT claim all three were set.",
        "",
        "Do not penalize extra reads.",
      ].join("\n"),
    );

    expect(r.context).toBe("Evaluate the reply:");
    expect(r.items).toStrictEqual([
      "It says track 20 is missing.",
      "It does NOT claim all three were set.",
    ]);
    expect(r.trailer).toBe("Do not penalize extra reads.");
  });

  it("joins continuation lines onto the previous item", () => {
    const r = splitRequirements(
      [
        "1. It tells the user track 20 is missing. Any wording is",
        "   fine, and so is a mention of the track count.",
        "2. Second.",
      ].join("\n"),
    );

    expect(r.items).toStrictEqual([
      "It tells the user track 20 is missing. Any wording is fine, and so is a mention of the track count.",
      "Second.",
    ]);
    expect(r.context).toBe("");
  });

  it("keeps a multi-line trailer together", () => {
    const r = splitRequirements("1. A.\n\nNote one.\nNote two.");

    expect(r.items).toStrictEqual(["A."]);
    expect(r.trailer).toBe("Note one.\nNote two.");
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { unknownCategoryNote } from "../../../query/notes/unknown-category-note.ts";

describe("unknownCategoryNote", () => {
  it("is undefined for zero", () => {
    expect(unknownCategoryNote(0)).toBeUndefined();
  });

  it("says how many were left out and how to list them", () => {
    expect(unknownCategoryNote(1)).toBe(
      "1 plug-in with an unknown category was left out. Drop deviceKind/subcategory to list it.",
    );
    expect(unknownCategoryNote(3)).toBe(
      "3 plug-ins with an unknown category were left out. Drop deviceKind/subcategory to list them.",
    );
  });
});

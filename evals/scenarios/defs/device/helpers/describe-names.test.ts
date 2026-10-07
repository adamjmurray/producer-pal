// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { describeNames } from "./describe-names.ts";

describe("describeNames", () => {
  it("says none only when there are no names", () => {
    expect(describeNames([])).toBe("none");
  });

  it("quotes names and marks unnamed ones", () => {
    expect(describeNames(["Kit", ""])).toBe('"Kit", (unnamed)');
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { durationEntry } from "#src/notation/stark/helpers/stark-duration-grid.ts";

describe("stark duration grid — durationEntry", () => {
  it("appends a dot for a dotted note value", () => {
    expect(durationEntry({ n: 4, dotted: true, triplet: false }).token).toBe(
      "4.",
    );
  });

  it("appends a t for a triplet note value", () => {
    expect(durationEntry({ n: 4, dotted: false, triplet: true }).token).toBe(
      "4t",
    );
  });

  it("uses a bare N for a plain note value", () => {
    expect(durationEntry({ n: 4, dotted: false, triplet: false }).token).toBe(
      "4",
    );
  });
});

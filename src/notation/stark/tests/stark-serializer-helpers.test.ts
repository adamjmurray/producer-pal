// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  classifyPitchedLine,
  durationEntry,
  dynamicSuffix,
} from "#src/notation/stark/stark-serializer-helpers.ts";

describe("stark serializer helpers — classifyPitchedLine", () => {
  it("falls back to a melody classification for an empty note list", () => {
    const result = classifyPitchedLine([]);

    // Empty → median pitch defaults to 60 → melody line, C3 register.
    expect(result.lineType).toBe("melody");
    expect(result.registerDefault).toBe(60);
    expect(result.sorted).toStrictEqual([]);
  });
});

describe("stark serializer helpers — durationEntry", () => {
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

describe("stark serializer helpers — dynamicSuffix", () => {
  it("maps a soft velocity to the ? suffix", () => {
    expect(dynamicSuffix(50)).toBe("?");
  });
});

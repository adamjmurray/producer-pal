// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  isSuperseded,
  linkReplacer,
  markSuperseded,
  replacerOf,
} from "#src/tools/shared/helpers/entry-details.ts";

describe("markSuperseded", () => {
  it("marks an entry without changing what it serializes to or equals", () => {
    const entry = markSuperseded({ name: "Gain", detail: "any wording" });

    expect(isSuperseded(entry)).toBe(true);
    expect(JSON.stringify(entry)).toBe(
      '{"name":"Gain","detail":"any wording"}',
    );
    expect(entry).toStrictEqual({ name: "Gain", detail: "any wording" });
  });

  it("leaves an unmarked entry unmarked, whatever its detail says", () => {
    expect(isSuperseded({ detail: "named again later in this call" })).toBe(
      false,
    );
  });
});

describe("linkReplacer", () => {
  it("links an entry to its replacement without changing what it serializes to", () => {
    const later = { name: "Gain" };
    const entry = { name: "Gain", detail: "any wording" };

    linkReplacer(entry, { entry: later, by: '"Gain"' });

    expect(replacerOf(entry)).toStrictEqual({ entry: later, by: '"Gain"' });
    expect(JSON.stringify(entry)).toBe(
      '{"name":"Gain","detail":"any wording"}',
    );
    expect(replacerOf(later)).toBeUndefined();
  });
});

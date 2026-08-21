// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { optionalNumber } from "#src/tools/shared/tool-framework/optional-number.ts";

const index = optionalNumber(z.coerce.number().int().min(0));
const count = optionalNumber(z.coerce.number().int().min(1).default(1));

describe("optionalNumber", () => {
  it("reads a null as unset, not 0", () => {
    expect(index.parse(null)).toBeUndefined();
  });

  it("reads a blank string as unset, not 0", () => {
    expect(index.parse("")).toBeUndefined();
    expect(index.parse("   ")).toBeUndefined();
  });

  it("leaves an omitted value undefined", () => {
    expect(index.parse(undefined)).toBeUndefined();
  });

  it("still coerces and validates a real value", () => {
    expect(index.parse("2")).toBe(2);
    expect(index.parse(2)).toBe(2);
    expect(index.safeParse(-1).success).toBe(false);
    expect(index.safeParse("abc").success).toBe(false);
  });

  // Without this, `count: null` coerces to 0, fails min(1), and takes the whole
  // call down instead of falling back to the default.
  it("hands a defaulted param its default, not a rejection", () => {
    expect(count.parse(null)).toBe(1);
    expect(count.parse("")).toBe(1);
    expect(count.parse(undefined)).toBe(1);
    expect(count.parse(3)).toBe(3);
  });

  it("leaves the JSON Schema alone", () => {
    expect(z.toJSONSchema(z.object({ index }), { io: "input" })).toStrictEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        index: { type: "integer", minimum: 0, maximum: 9007199254740991 },
      },
    });
  });
});

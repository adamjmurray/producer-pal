// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { optionalNumber } from "#src/tools/shared/tool-framework/optional-number.ts";

const index = optionalNumber(z.coerce.number().int().min(0));

describe("optionalNumber", () => {
  it("reads a null as null, not 0", () => {
    expect(index.parse(null)).toBeNull();
  });

  it("reads a blank string as null, not 0", () => {
    expect(index.parse("")).toBeNull();
    expect(index.parse("   ")).toBeNull();
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

  it("only adds null to the JSON Schema", () => {
    expect(z.toJSONSchema(z.object({ index }), { io: "input" })).toStrictEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        index: {
          anyOf: [
            { type: "integer", minimum: 0, maximum: 9007199254740991 },
            { type: "null" },
          ],
        },
      },
    });
  });
});

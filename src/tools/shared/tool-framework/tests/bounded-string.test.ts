// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { boundedString } from "#src/tools/shared/tool-framework/bounded-string.ts";

describe("boundedString", () => {
  it("accepts input up to the limit", () => {
    expect(boundedString(5).parse("12345")).toBe("12345");
  });

  it("rejects input over the limit", () => {
    const result = boundedString(5).safeParse("123456");

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "must be at most 5 characters",
    );
  });

  it("emits no maxLength in the JSON Schema", () => {
    expect(z.toJSONSchema(boundedString(10_000))).toStrictEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "string",
    });
  });
});

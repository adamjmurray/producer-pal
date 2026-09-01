// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { param } from "../modal-config.ts";
import { resolveToolSchema } from "../resolve-tool-schema.ts";

/**
 * Parse a value through the schema a tool call is actually validated against.
 * @param schema - The resolved validating schema
 * @param args - The args to parse
 * @returns Whether the parse succeeded
 */
function accepts(
  schema: Record<string, z.ZodType>,
  args: Record<string, unknown>,
): boolean {
  return z.object(schema).safeParse(args).success;
}

describe("resolveToolSchema", () => {
  // The bug this guards: the trim reached `validating`, so the value a caller
  // was merely no longer OFFERED became one the MCP layer refused outright —
  // a hard break for anyone still sending the old spelling.
  describe("an enum value default trims", () => {
    const inputSchema = {
      type: param(z.enum(["midi", "audio", "return"]).default("midi"), {
        default: { description: "type", excludeEnumValues: ["return"] },
      }),
    };

    it("is still accepted from a caller who names it", () => {
      for (const context of [
        {},
        { smallModelMode: true },
        { notation: "stark" as const },
        { smallModelMode: true, notation: "midi-json" as const },
      ]) {
        const { validating } = resolveToolSchema(inputSchema, context);

        expect(accepts(validating, { type: "return" })).toBe(true);
      }
    });

    it("is not offered in the published schema", () => {
      const { published } = resolveToolSchema(inputSchema, {});

      expect(accepts(published, { type: "return" })).toBe(false);
      expect(accepts(published, { type: "audio" })).toBe(true);
    });
  });

  // The stricter sibling: a mode's own trim is defense in depth, so it does
  // come out of the schema that validates.
  it("refuses an enum value a mode trims", () => {
    const inputSchema = {
      include: param(z.array(z.enum(["a", "b"])).default([]), {
        default: "what to include",
        smallModel: { excludeEnumValues: ["b"] },
      }),
    };

    const { validating } = resolveToolSchema(inputSchema, {
      smallModelMode: true,
    });

    expect(accepts(validating, { include: ["b"] })).toBe(false);
    expect(accepts(validating, { include: ["a"] })).toBe(true);
  });
});

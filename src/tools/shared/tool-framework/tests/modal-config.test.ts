// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  getParamModes,
  param,
  resolveModalDescription,
  resolveParamModes,
} from "../modal-config.ts";

describe("param / getParamModes", () => {
  it("applies the default description and tags the schema with its modes", () => {
    const modes = { default: "base description", smallModel: "short" };
    const schema = param(z.string().optional(), modes);

    expect(schema.description).toBe("base description");
    expect(getParamModes(schema)).toBe(modes);
  });

  it("returns undefined for a schema with no modal overrides", () => {
    expect(getParamModes(z.string().describe("plain"))).toBeUndefined();
  });
});

describe("resolveParamModes", () => {
  it("returns empty maps when no params have modes", () => {
    const result = resolveParamModes(
      { a: z.string().describe("plain"), b: z.number() },
      { smallModelMode: true, notation: "midi-json" },
    );

    expect(result).toStrictEqual({
      excludeParams: [],
      descriptionOverrides: {},
      excludeEnumValues: {},
      unpublishedEnumValues: {},
    });
  });

  it("leaves modal params untouched when no mode is active", () => {
    const schema = {
      notes: param(z.string().optional(), {
        default: "base",
        smallModel: "short",
        "midi-json": "json",
      }),
    };

    // barbeat is the default notation and applies no overrides.
    const result = resolveParamModes(schema, {
      smallModelMode: false,
      notation: "barbeat",
    });

    expect(result.excludeParams).toStrictEqual([]);
    expect(result.descriptionOverrides).toStrictEqual({});
  });

  it("hides a param whose small-model mode is null", () => {
    const schema = {
      advanced: param(z.string().optional(), {
        default: "base",
        smallModel: null,
      }),
    };

    const result = resolveParamModes(schema, { smallModelMode: true });

    expect(result.excludeParams).toStrictEqual(["advanced"]);
    expect(result.descriptionOverrides).toStrictEqual({});
  });

  it("hides a param whose active-notation mode is null", () => {
    const schema = {
      barbeatOnly: param(z.string().optional(), {
        default: "base",
        "midi-json": null,
      }),
    };

    const result = resolveParamModes(schema, { notation: "midi-json" });

    expect(result.excludeParams).toStrictEqual(["barbeatOnly"]);
  });

  it("applies a string description override for small-model mode", () => {
    const schema = {
      name: param(z.string().optional(), {
        default: "long name description",
        smallModel: "name",
      }),
    };

    const result = resolveParamModes(schema, { smallModelMode: true });

    expect(result.descriptionOverrides).toStrictEqual({ name: "name" });
  });

  it("applies an object override's description and excluded enum values", () => {
    const schema = {
      include: param(z.array(z.enum(["a", "b", "c"])).default([]), {
        default: "full include description",
        smallModel: { description: "short include", excludeEnumValues: ["c"] },
      }),
    };

    const result = resolveParamModes(schema, { smallModelMode: true });

    expect(result.descriptionOverrides).toStrictEqual({
      include: "short include",
    });
    expect(result.excludeEnumValues).toStrictEqual({ include: ["c"] });
  });

  it("trims enum values without a description override (keeps the base)", () => {
    const schema = {
      include: param(z.array(z.enum(["a", "b"])).default([]), {
        default: "full include description",
        smallModel: { excludeEnumValues: ["b"] },
      }),
    };

    const result = resolveParamModes(schema, { smallModelMode: true });

    expect(result.descriptionOverrides).toStrictEqual({});
    expect(result.excludeEnumValues).toStrictEqual({ include: ["b"] });
  });

  it("trims an enum value in every mode when default says to", () => {
    const schema = {
      type: param(z.enum(["midi", "audio", "return"]).default("midi"), {
        default: {
          description: "midi or audio",
          excludeEnumValues: ["return"],
        },
      }),
    };

    for (const context of [
      { smallModelMode: false, notation: "barbeat" as const },
      { smallModelMode: true },
      { notation: "stark" as const },
    ]) {
      const resolved = resolveParamModes(schema, context);

      expect(resolved.unpublishedEnumValues).toStrictEqual({
        type: ["return"],
      });
      // Hidden, not refused - the handler still takes it.
      expect(resolved.excludeEnumValues).toStrictEqual({});
    }
  });

  it("describes a param from default's object form", () => {
    const schema = {
      type: param(z.enum(["midi", "return"]).default("midi"), {
        default: { description: "midi only", excludeEnumValues: ["return"] },
      }),
    };

    expect(schema.type.description).toBe("midi only");
  });

  // The trim is a floor, not something a mode override replaces: a mode that
  // only rewords the param must not put the hidden value back.
  it("keeps default's trim when a mode overrides only the description", () => {
    const schema = {
      type: param(z.enum(["midi", "audio", "return"]).default("midi"), {
        default: {
          description: "midi or audio",
          excludeEnumValues: ["return"],
        },
        smallModel: "type",
      }),
    };

    const result = resolveParamModes(schema, { smallModelMode: true });

    expect(result.descriptionOverrides).toStrictEqual({ type: "type" });
    expect(result.unpublishedEnumValues).toStrictEqual({ type: ["return"] });
  });

  // Both trims apply to what gets published, but only the mode's takes the
  // value out of the schema that validates.
  it("keeps a mode's trim apart from default's", () => {
    const schema = {
      include: param(z.array(z.enum(["a", "b", "c"])).default([]), {
        default: { description: "a or b", excludeEnumValues: ["c"] },
        smallModel: { excludeEnumValues: ["b"] },
      }),
    };

    const result = resolveParamModes(schema, { smallModelMode: true });

    expect(result.excludeEnumValues).toStrictEqual({ include: ["b"] });
    expect(result.unpublishedEnumValues).toStrictEqual({ include: ["c"] });
  });

  it("lets the active notation win over small-model for the description", () => {
    const schema = {
      notes: param(z.string().optional(), {
        default: "base",
        smallModel: "small-model text",
        "midi-json": "json text",
      }),
    };

    const result = resolveParamModes(schema, {
      smallModelMode: true,
      notation: "midi-json",
    });

    expect(result.descriptionOverrides).toStrictEqual({ notes: "json text" });
  });

  it("falls back to the small-model override when the notation has no entry", () => {
    const schema = {
      notes: param(z.string().optional(), {
        default: "base",
        smallModel: "small-model text",
        "midi-json": "json text",
      }),
    };

    // stark has no entry, so the small-model override still applies.
    const result = resolveParamModes(schema, {
      smallModelMode: true,
      notation: "stark",
    });

    expect(result.descriptionOverrides).toStrictEqual({
      notes: "small-model text",
    });
  });

  it("uses the compound smallModel:notation cell when both axes are active", () => {
    const schema = {
      notes: param(z.string().optional(), {
        default: "base",
        smallModel: "small barbeat text",
        stark: "large stark text",
        "smallModel:stark": "small stark text",
      }),
    };

    const result = resolveParamModes(schema, {
      smallModelMode: true,
      notation: "stark",
    });

    expect(result.descriptionOverrides).toStrictEqual({
      notes: "small stark text",
    });
  });

  it("ignores the compound cell for a large model (bare notation wins)", () => {
    const schema = {
      notes: param(z.string().optional(), {
        default: "base",
        stark: "large stark text",
        "smallModel:stark": "small stark text",
      }),
    };

    const result = resolveParamModes(schema, {
      smallModelMode: false,
      notation: "stark",
    });

    expect(result.descriptionOverrides).toStrictEqual({
      notes: "large stark text",
    });
  });

  it("ignores the compound cell in the barbeat default (smallModel wins)", () => {
    const schema = {
      notes: param(z.string().optional(), {
        default: "base",
        smallModel: "small barbeat text",
        "smallModel:stark": "small stark text",
      }),
    };

    const result = resolveParamModes(schema, {
      smallModelMode: true,
      notation: "barbeat",
    });

    expect(result.descriptionOverrides).toStrictEqual({
      notes: "small barbeat text",
    });
  });

  it("falls back to the bare notation when the compound cell is absent", () => {
    const schema = {
      notes: param(z.string().optional(), {
        default: "base",
        smallModel: "small barbeat text",
        stark: "large stark text",
      }),
    };

    const result = resolveParamModes(schema, {
      smallModelMode: true,
      notation: "stark",
    });

    expect(result.descriptionOverrides).toStrictEqual({
      notes: "large stark text",
    });
  });

  it("hides a param whose compound cell is null", () => {
    const schema = {
      notes: param(z.string().optional(), {
        default: "base",
        stark: "large stark text",
        "smallModel:stark": null,
      }),
    };

    const result = resolveParamModes(schema, {
      smallModelMode: true,
      notation: "stark",
    });

    expect(result.excludeParams).toStrictEqual(["notes"]);
    expect(result.descriptionOverrides).toStrictEqual({});
  });
});

describe("resolveModalDescription", () => {
  it("returns a plain-string description unchanged", () => {
    expect(
      resolveModalDescription("plain", {
        smallModelMode: true,
        notation: "midi-json",
      }),
    ).toBe("plain");
  });

  it("returns the default when no mode is active", () => {
    expect(
      resolveModalDescription(
        { default: "base", smallModel: "short" },
        { notation: "barbeat" },
      ),
    ).toBe("base");
  });

  it("returns the small-model text in small-model mode", () => {
    expect(
      resolveModalDescription(
        { default: "base", smallModel: "short" },
        { smallModelMode: true },
      ),
    ).toBe("short");
  });

  it("lets the active notation win over small-model", () => {
    expect(
      resolveModalDescription(
        { default: "base", smallModel: "short", "midi-json": "json" },
        { smallModelMode: true, notation: "midi-json" },
      ),
    ).toBe("json");
  });

  it("falls back to default when the active notation has no entry", () => {
    expect(
      resolveModalDescription(
        { default: "base", "midi-json": "json" },
        { notation: "stark" },
      ),
    ).toBe("base");
  });

  it("uses the compound smallModel:notation cell when both axes are active", () => {
    expect(
      resolveModalDescription(
        {
          default: "base",
          smallModel: "short",
          stark: "large stark",
          "smallModel:stark": "small stark",
        },
        { smallModelMode: true, notation: "stark" },
      ),
    ).toBe("small stark");
  });

  it("falls back to the bare notation when the compound cell is absent", () => {
    expect(
      resolveModalDescription(
        { default: "base", smallModel: "short", stark: "large stark" },
        { smallModelMode: true, notation: "stark" },
      ),
    ).toBe("large stark");
  });
});

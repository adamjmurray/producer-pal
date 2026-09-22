// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A boolean or number that pairs per target arrives as a string, so the schema
// has to take a typed value, a single string and a list, and refuse a blank —
// unset-empty-params reads a schema that accepts "" as a param you can clear.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { splitList } from "../../lists/list-pairing.ts";
import {
  booleanForIndex,
  booleanList,
  enumForIndex,
  enumList,
  numberForIndex,
  numberList,
} from "../../lists/typed-lists.ts";

/**
 * The message a schema refused a value with.
 * @param schema - The schema under test
 * @param value - The value to parse
 * @returns The first issue's message, or null when the value parsed
 */
function refusal(schema: z.ZodType, value: unknown): string | null {
  const result = schema.safeParse(value);

  return result.success ? null : (result.error.issues[0]?.message ?? "");
}

/**
 * One param's published JSON Schema, as the model reads it.
 * @param schema - The param's schema
 * @returns The JSON Schema for that one param
 */
function publishedParam(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(z.object({ p: schema }), { io: "input" }) as {
    properties: Record<string, unknown>;
  };

  return json.properties.p;
}

describe("booleanList", () => {
  const schema = booleanList();

  it("coerces a typed boolean to a string", () => {
    expect(schema.parse(true)).toBe("true");
    expect(schema.parse(false)).toBe("false");
  });

  it("takes a single string, in any case and with spaces", () => {
    expect(schema.parse("true")).toBe("true");
    expect(schema.parse(" False ")).toBe(" False ");
  });

  it("takes a list", () => {
    expect(schema.parse("true,false,true")).toBe("true,false,true");
    expect(schema.parse("true, false")).toBe("true, false");
  });

  it("reads one trailing comma as a typo, not an entry", () => {
    expect(schema.parse("true,false,")).toBe("true,false,");
  });

  it("refuses a blank", () => {
    expect(refusal(schema, "")).toBe("each entry must be true or false");
    expect(refusal(schema, "  ")).toBe("each entry must be true or false");
  });

  it("refuses an empty entry", () => {
    expect(refusal(schema, "true,,false")).toBe(
      "each entry must be true or false",
    );
    expect(refusal(schema, ",")).toBe("each entry must be true or false");
  });

  it("refuses an entry that is not a boolean", () => {
    expect(refusal(schema, "true,yes")).toBe(
      "each entry must be true or false",
    );
    expect(refusal(schema, "1")).toBe("each entry must be true or false");
  });

  // unset-empty-params tells a clearable text param from this one by parsing a
  // blank, so a schema that accepted "" would silently drop `warp: ""`.
  it("is not a param a blank can clear", () => {
    expect(schema.safeParse("").data).not.toBe("");
  });

  it("publishes as a plain string", () => {
    expect(publishedParam(schema.optional())).toStrictEqual({
      type: "string",
    });
  });

  it("chains .optional() and .default()", () => {
    expect(schema.optional().parse(undefined)).toBeUndefined();
    expect(schema.default("true").parse(undefined)).toBe("true");
  });
});

describe("numberList", () => {
  const gain = numberList({ min: -70, max: 6 });

  it("coerces a typed number to a string", () => {
    expect(gain.parse(-6)).toBe("-6");
    expect(gain.parse(0)).toBe("0");
  });

  it("takes a single string and a list", () => {
    expect(gain.parse("-6")).toBe("-6");
    expect(gain.parse("-6,-3,0")).toBe("-6,-3,0");
    expect(gain.parse("-6, -3.5")).toBe("-6, -3.5");
  });

  it("reads one trailing comma as a typo, not an entry", () => {
    expect(gain.parse("-6,0,")).toBe("-6,0,");
  });

  it("refuses a blank and an empty entry", () => {
    expect(refusal(gain, "")).toBe("each entry must be a number from -70 to 6");
    expect(refusal(gain, "-6,,0")).toBe(
      "each entry must be a number from -70 to 6",
    );
  });

  it("refuses an entry that is not a number", () => {
    expect(refusal(gain, "-6,loud")).toBe(
      "each entry must be a number from -70 to 6",
    );
    expect(refusal(gain, "Infinity")).toBe(
      "each entry must be a number from -70 to 6",
    );
  });

  it("refuses an entry out of range", () => {
    expect(refusal(gain, "-71")).toBe(
      "each entry must be a number from -70 to 6",
    );
    expect(refusal(gain, "0,7")).toBe(
      "each entry must be a number from -70 to 6",
    );
  });

  it("names only the bound it has", () => {
    expect(refusal(numberList({ min: 0 }), "-1")).toBe(
      "each entry must be a number 0 or greater",
    );
    expect(refusal(numberList({ max: 127 }), "128")).toBe(
      "each entry must be a number 127 or less",
    );
    expect(refusal(numberList(), "loud")).toBe("each entry must be a number");
  });

  it("refuses a fractional entry when whole numbers are asked for", () => {
    const bars = numberList({ min: 1, max: 8, int: true });

    expect(bars.parse("1,2,8")).toBe("1,2,8");
    expect(refusal(bars, "1,2.5")).toBe("each entry must be a whole number");
  });

  // Two complaints for one entry reads as two problems, so the whole-number
  // check skips what the range check already refused.
  it("gives an entry that is no number at all one complaint", () => {
    const bars = numberList({ min: 1, max: 8, int: true });
    const result = bars.safeParse("loud");

    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
  });

  it("publishes as a plain string", () => {
    expect(publishedParam(gain.optional())).toStrictEqual({ type: "string" });
  });

  it("chains .optional() and .default()", () => {
    expect(gain.optional().parse(undefined)).toBeUndefined();
    expect(gain.default("0").parse(undefined)).toBe("0");
  });
});

// The shape a tool will actually declare these in.
describe("enumList", () => {
  const schema = enumList(["midi", "audio"]);

  it("takes a single value, in any case and with spaces", () => {
    expect(schema.parse("midi")).toBe("midi");
    expect(schema.parse(" AUDIO ")).toBe(" AUDIO ");
  });

  it("takes a list, reading one trailing comma as a typo", () => {
    expect(schema.parse("midi,audio,MIDI")).toBe("midi,audio,MIDI");
    expect(schema.parse("midi,audio,")).toBe("midi,audio,");
  });

  it("refuses a blank, an empty entry and a value not in the set", () => {
    const message = "each entry must be one of: midi, audio";

    expect(refusal(schema, "")).toBe(message);
    expect(refusal(schema, "midi,,audio")).toBe(message);
    expect(refusal(schema, "midi,return")).toBe(message);
  });

  it("publishes as a plain string with no enum", () => {
    expect(publishedParam(schema)).toStrictEqual({ type: "string" });
  });

  it("chains .optional() and .default()", () => {
    expect(schema.optional().parse(undefined)).toBeUndefined();
    expect(schema.default("midi").parse(undefined)).toBe("midi");
  });
});

describe("enumForIndex", () => {
  const values = ["midi", "audio"] as const;

  it("gives every target the whole value when there is nothing to pair", () => {
    expect(enumForIndex("Audio", 2, null, values)).toBe("audio");
  });

  it("reads the entry in the target's position, in the tool's spelling", () => {
    const value = "midi, AUDIO, midi";
    const parsed = splitList(value, 3, "type");

    expect(enumForIndex(value, 0, parsed, values)).toBe("midi");
    expect(enumForIndex(value, 1, parsed, values)).toBe("audio");
    expect(enumForIndex(value, 2, parsed, values)).toBe("midi");
  });

  it("is undefined when the param was not sent, or names no value", () => {
    expect(enumForIndex(undefined, 0, null, values)).toBeUndefined();
    expect(enumForIndex("return", 0, null, values)).toBeUndefined();
  });
});

describe("through param()", () => {
  it("resolves to a described string a tool can publish", () => {
    const { published, validating } = resolveToolSchema(
      {
        warp: param(booleanList().optional(), {
          default: "one per target, or one for all",
        }),
        gain: param(numberList({ min: -70, max: 6 }).optional(), {
          default: "dB, one per target",
        }),
      },
      {},
    );

    expect(validating.warp?.safeParse(true).data).toBe("true");
    expect(validating.gain?.safeParse(-6).data).toBe("-6");
    expect(publishedParam(published.warp as z.ZodType)).toStrictEqual({
      type: "string",
      description: "one per target, or one for all",
    });
    expect(publishedParam(published.gain as z.ZodType)).toStrictEqual({
      type: "string",
      description: "dB, one per target",
    });
  });
});

describe("booleanForIndex", () => {
  it("gives every target the whole value when there is nothing to pair", () => {
    const parsed = splitList("true", 3, "warp");

    expect(booleanForIndex("true", 0, parsed)).toBe(true);
    expect(booleanForIndex("true", 2, parsed)).toBe(true);
    expect(booleanForIndex("False", 1, null)).toBe(false);
  });

  it("reads the entry in the target's position", () => {
    const value = "true, false, true";
    const parsed = splitList(value, 3, "warp");

    expect(booleanForIndex(value, 0, parsed)).toBe(true);
    expect(booleanForIndex(value, 1, parsed)).toBe(false);
    expect(booleanForIndex(value, 2, parsed)).toBe(true);
  });

  it("is undefined when the param was not sent, or the list ran short", () => {
    expect(booleanForIndex(undefined, 0, null)).toBeUndefined();
    expect(
      booleanForIndex("true,false", 2, splitList("true,false", 3, "warp")),
    ).toBeUndefined();
  });
});

describe("numberForIndex", () => {
  it("gives every target the whole value when there is nothing to pair", () => {
    expect(numberForIndex("-6", 2, null)).toBe(-6);
  });

  it("reads the entry in the target's position", () => {
    const value = "-6, -3.5, 0";
    const parsed = splitList(value, 3, "gain");

    expect(numberForIndex(value, 0, parsed)).toBe(-6);
    expect(numberForIndex(value, 1, parsed)).toBe(-3.5);
    expect(numberForIndex(value, 2, parsed)).toBe(0);
  });

  it("is undefined when the param was not sent, or names no number", () => {
    expect(numberForIndex(undefined, 0, null)).toBeUndefined();
    expect(numberForIndex("loud", 0, null)).toBeUndefined();
  });
});

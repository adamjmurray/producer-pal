// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type FunctionNode } from "#src/notation/transform/parser/transform-parser.ts";
import { projectRoot } from "#src/test/helpers/meta-test-helpers.ts";
import { parseAssignments } from "./parse-test-helpers.ts";

const GRAMMAR_PATH = "src/notation/transform/parser/transform-grammar.peggy";

/** The grammar rules that enumerate expression-function names. */
const NAME_RULES = ["cyclicalFunctionName", "otherFunctionName"];

/**
 * Read the quoted alternatives out of one grammar rule.
 *
 * @param grammar - The grammar source
 * @param rule - Rule name to read
 * @returns The names that rule accepts
 */
function ruleAlternatives(grammar: string, rule: string): string[] {
  const body = new RegExp(`^${rule}\\n((?:\\s+[=/].*\\n)+)`, "m").exec(
    grammar,
  )?.[1];

  return [...(body ?? "").matchAll(/"(\w+)"/g)].map(
    (match) => match[1] as string,
  );
}

describe("Transform Parser - Function Keywords", () => {
  // The unknown-function error names every function the grammar accepts, from a
  // list the grammar keeps by hand. Read that list back out of the message and
  // check each name really parses, so a rule renamed or added without touching
  // the list fails here rather than sending a model after a function that
  // doesn't exist.
  describe("unknown function error", () => {
    /** @returns The function names the error message advertises */
    function advertisedNames(): string[] {
      let message = "";

      try {
        parseAssignments("velocity += nosuchfn(1)");
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      return (/available: ([^.]+)\./.exec(message)?.[1] ?? "").split(", ");
    }

    it("advertises only functions the grammar accepts", () => {
      const names = advertisedNames();

      expect(names.length).toBeGreaterThan(20);

      for (const name of names) {
        // Args differ per function; any parse failure OTHER than "unknown
        // function" means the name itself is real.
        try {
          parseAssignments(`velocity += ${name}(1)`);
        } catch (error) {
          expect(String(error)).not.toContain(`unknown function ${name}()`);
        }
      }
    });

    it("advertises every function the grammar accepts", () => {
      const grammar = readFileSync(join(projectRoot, GRAMMAR_PATH), "utf8");
      const declared = new Set(
        NAME_RULES.flatMap((rule) => ruleAlternatives(grammar, rule)),
      );

      // `swing` has its own rule — an argument list no other function takes —
      // so it appears in neither name rule.
      declared.add("swing");

      expect(advertisedNames().toSorted()).toStrictEqual(
        [...declared].toSorted(),
      );
    });
  });

  describe("sync keyword", () => {
    it("parses cos with note-value period and sync", () => {
      const result = parseAssignments("velocity += cos(n/4, sync)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "cos",
        args: [{ type: "nDuration", wholeNoteFraction: 0.25 }],
        sync: true,
        raw: false,
      });
    });

    it("parses tri with period, phase, and sync", () => {
      const result = parseAssignments("velocity += tri(n/2, 0.5, sync)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "tri",
        args: [{ type: "nDuration", wholeNoteFraction: 0.5 }, 0.5],
        sync: true,
        raw: false,
      });
    });

    it("parses square with all args and sync", () => {
      const result = parseAssignments("velocity += square(n/2, 0, 0.75, sync)");

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "square",
        args: [{ type: "nDuration", wholeNoteFraction: 0.5 }, 0, 0.75],
        sync: true,
        raw: false,
      });
    });

    it("parses saw with a bar-length period and sync", () => {
      const result = parseAssignments(
        "velocity += saw(clip.barDuration, sync)",
      );

      expect(result[0]!.expression).toStrictEqual({
        type: "function",
        name: "saw",
        args: [{ type: "variable", namespace: "clip", name: "barDuration" }],
        sync: true,
        raw: false,
      });
    });

    it("rejects sync on swing", () => {
      expect(() => parseAssignments("timing = swing(0.05, sync)")).toThrow(
        'but "t" found',
      );
    });

    it("rejects sync on rand", () => {
      expect(() => parseAssignments("velocity += rand(sync)")).toThrow(
        'but "v" found',
      );
    });

    it("rejects sync on ramp", () => {
      expect(() => parseAssignments("velocity += ramp(0, 1, sync)")).toThrow(
        'but "v" found',
      );
    });

    it("rejects sync on round", () => {
      expect(() => parseAssignments("velocity += round(sync)")).toThrow(
        'but "v" found',
      );
    });

    it("rejects sync on choose", () => {
      expect(() => parseAssignments("velocity += choose(1, 2, sync)")).toThrow(
        'but "v" found',
      );
    });
  });

  describe("removed period syntax (Nt, N:Nt)", () => {
    it.each([
      "velocity += cos(1t)",
      "velocity += cos(4t, sync)",
      "velocity += cos(1:0t)",
      "velocity += cos(4:0t, sync)",
      "velocity += cos(1/2t)",
      // Mixed-number periods (`int+fraction`), bare and colon-prefixed: the
      // fraction must not swallow the trailing `t` and mask the removed syntax.
      "velocity += cos(1+1/2t)",
      "velocity += cos(2:1+1/2t)",
      "timing = quant(1/4t)",
      "timing = swing(0.05, 1/2t)",
    ])("rejects %s", (expr) => {
      expect(() => parseAssignments(expr)).toThrow("no longer supported");
    });
  });

  describe("raw keyword", () => {
    it.each([
      ["swing(0.05, raw)", [0.05], true],
      [
        "swing(0.03, n/8, raw)",
        [0.03, { type: "nDuration", wholeNoteFraction: 0.125 }],
        true,
      ],
      ["swing(0.05)", [0.05], false],
      [
        "swing(0.05, n/8)",
        [0.05, { type: "nDuration", wholeNoteFraction: 0.125 }],
        false,
      ],
    ] as const)("parses %s", (expr, expectedArgs, expectedRaw) => {
      const result = parseAssignments(`timing = ${expr}`);
      const node = result[0]!.expression as FunctionNode;

      expect(node.name).toBe("swing");
      expect(node.args).toStrictEqual(expectedArgs);
      expect(node.raw).toBe(expectedRaw);
    });

    it("rejects raw on non-swing functions", () => {
      expect(() => parseAssignments("velocity += rand(raw)")).toThrow(
        'but "v" found',
      );
      expect(() => parseAssignments("velocity += cos(n/4, raw)")).toThrow(
        'but "v" found',
      );
    });
  });
});

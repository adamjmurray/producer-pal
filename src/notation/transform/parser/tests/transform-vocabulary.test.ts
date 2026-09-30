// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  suggestTransformName,
  TRANSFORM_PARAMETERS,
  TRANSFORM_PROPERTIES,
  WHERE_PROPERTIES,
} from "#src/notation/transform/parser/helpers/transform-vocabulary.ts";
import {
  readTransformGrammar,
  ruleAlternatives,
} from "#src/notation/transform/tests/parser/parse-test-helpers.ts";

/**
 * @param names - Names, possibly repeated
 * @returns The distinct names, sorted
 */
function distinct(names: string[]): string[] {
  return [...new Set(names)].toSorted();
}

describe("transform vocabulary", () => {
  // Hints suggest names from these lists, so each must match what the grammar
  // accepts — a stale list would steer a model to a name that fails to parse.
  const grammar = readTransformGrammar();

  it("lists every parameter the grammar accepts", () => {
    expect(distinct(TRANSFORM_PARAMETERS)).toStrictEqual(
      distinct(ruleAlternatives(grammar, "parameter")),
    );
  });

  it.each(Object.keys(TRANSFORM_PROPERTIES))(
    "lists every %s.* property the grammar accepts",
    (namespace) => {
      expect(distinct(TRANSFORM_PROPERTIES[namespace] ?? [])).toStrictEqual(
        distinct(ruleAlternatives(grammar, `${namespace}PropertyName`)),
      );
    },
  );

  it("lists the where() properties the grammar allows", () => {
    const allowed = /PREDICATE_NOTE_PROPS = new Set\(\[([^\]]+)\]/.exec(
      grammar,
    )?.[1];
    const names = [...(allowed ?? "").matchAll(/"(\w+)"/g)].map(
      (match) => `note.${match[1]}`,
    );

    expect(distinct(WHERE_PROPERTIES)).toStrictEqual(distinct(names));
  });

  describe("suggestTransformName", () => {
    it.each([
      ["length", TRANSFORM_PARAMETERS, "duration"],
      ["vel", TRANSFORM_PARAMETERS, "velocity"],
      ["velocty", TRANSFORM_PARAMETERS, "velocity"],
      ["Velocity", TRANSFORM_PARAMETERS, "velocity"],
      ["p", TRANSFORM_PARAMETERS, null],
      ["v", TRANSFORM_PARAMETERS, "velocity"],
      ["G", TRANSFORM_PARAMETERS, null],
      ["T", TRANSFORM_PARAMETERS, null],
      ["pan", TRANSFORM_PARAMETERS, null],
      ["gate", TRANSFORM_PARAMETERS, null],
      ["gian", TRANSFORM_PARAMETERS, null],
      ["gan", TRANSFORM_PARAMETERS, "gain"],
      ["xyz", TRANSFORM_PARAMETERS, null],
      ["length", ["pitch"], null],
    ])("%s → %s", (name, candidates, expected) => {
      expect(suggestTransformName(name, candidates)).toBe(expected);
    });
  });
});

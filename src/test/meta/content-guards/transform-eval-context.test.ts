// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  findSourceFiles,
  projectRoot,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";

// The transform evaluator used to thread these six values positionally through
// every expression, function and predicate call. Two numbers, a range and a
// callback in a row are easy to swap and the types don't notice, so they travel
// together as one EvalContext object now.

const TRANSFORM_DIR = path.join(projectRoot, "src", "notation", "transform");

const CONTEXT_NAMES = new Set([
  "position",
  "timeSigNumerator",
  "timeSigDenominator",
  "timeRange",
  "noteProperties",
  "evaluateExpression",
]);

// Two is still readable (a meter, say); three is the shape coming back.
const MAX_SEPARATE_PARAMS = 2;

describe("transform evaluation context", () => {
  it("should pass the evaluation context as one object", () => {
    const violations: { file: string; reason: string }[] = [];

    for (const file of findSourceFiles(TRANSFORM_DIR)) {
      const rel = path.relative(projectRoot, file);

      for (const found of findLooseContextParams(file)) {
        violations.push({
          file: `${rel}:${found.line}`,
          reason: found.names.join(", "),
        });
      }
    }

    throwOnFileViolations(
      violations,
      "Found evaluation context values passed as separate parameters",
      "Take an EvalContext (src/notation/transform/helpers/transform-context.ts) instead.",
    );

    expect(violations).toHaveLength(0);
  });
});

/** One function signature spreading the context back out. */
interface LooseParams {
  line: number;
  names: string[];
}

/**
 * Find every function in a file — declaration, arrow, method or function type —
 * that declares too many of the context values as its own parameters.
 * @param file - Absolute path to the source file
 * @returns One entry per offending signature
 */
function findLooseContextParams(file: string): LooseParams[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: LooseParams[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) {
      const names = node.parameters
        .map((param) => param.name)
        .filter(ts.isIdentifier)
        .map((name) => name.text)
        .filter((name) => CONTEXT_NAMES.has(name));

      if (names.length > MAX_SEPARATE_PARAMS) {
        const { line } = source.getLineAndCharacterOfPosition(
          node.getStart(source),
        );

        found.push({ line: line + 1, names });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return found;
}

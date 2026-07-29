// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSourceFiles,
  projectRoot,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";

// Ports jsdoc/require-jsdoc, which oxlint does not implement. The eslint config
// ran it with `require: { FunctionDeclaration: true }` and
// `publicOnly: { esm: true }`, i.e. every EXPORTED function declaration needs a
// JSDoc block. jsdoc/require-param and jsdoc/require-returns — which check that
// an existing block is complete — are native in oxlint and stay there, so this
// only has to cover the block's presence.
//
// Deliberately narrower than the rule in one way: a function declared bare and
// exported later through `export { foo }` is public to the rule but invisible
// here. Every current declaration in the trees below uses the inline `export`
// form, so nothing is exempted in practice.

const TREES = ["src", "scripts", "evals", "webui/src", "e2e"];

/** An exported function declaration, which `publicOnly: { esm: true }` covers. */
const EXPORTED_FUNCTION =
  /^export\s+(?:default\s+)?(?:async\s+)?function\b\s*\*?\s*([A-Za-z0-9_$]*)/;

// This file spells the directive names out to detect them, so it matches itself.
const SELF = "src/test/meta/jsdoc-requirements.test.ts";

describe("JSDoc requirements", () => {
  it("should document every exported function declaration", () => {
    const violations: { file: string; reason: string }[] = [];

    for (const tree of TREES) {
      for (const file of findSourceFiles(path.join(projectRoot, tree))) {
        const rel = path.relative(projectRoot, file);

        if (rel === SELF) continue;

        const lines = fs.readFileSync(file, "utf8").split("\n");

        for (const [i, line] of lines.entries()) {
          const match = EXPORTED_FUNCTION.exec(line);

          if (match == null) continue;
          if (hasJsdocAbove(lines, i)) continue;
          if (isSuppressed(lines, i)) continue;

          // The capture is empty for `export default function () {}`.
          const name = match[1] === "" ? "(default)" : match[1];

          violations.push({
            file: `${rel}:${i + 1}`,
            reason: `exported function ${name} has no JSDoc block`,
          });
        }
      }
    }

    throwOnFileViolations(
      violations,
      "Found undocumented exported function(s)",
      "Add a /** ... */ block with @param and @returns descriptions.",
    );

    expect(violations).toHaveLength(0);
  });
});

/**
 * Whether a JSDoc block closes on the line above a declaration
 * @param lines - The file's lines
 * @param index - Zero-based index of the declaration line
 * @returns True when the preceding non-blank line ends a block comment
 */
function hasJsdocAbove(lines: string[], index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const line = (lines[i] ?? "").trim();

    // Decorators and line comments may sit between the block and the
    // declaration; blank lines may not, matching the jsdoc plugin.
    if (line === "" || line.startsWith("//") || line.startsWith("@")) continue;

    return line.endsWith("*/");
  }

  return false;
}

/**
 * Whether a lint directive disables the JSDoc requirement here or file-wide.
 * Recognizes the eslint- and oxlint- prefixes alike, as oxlint honors both.
 * @param lines - The file's lines
 * @param index - Zero-based index of the declaration line
 * @returns True when the rule is suppressed there
 */
function isSuppressed(lines: string[], index: number): boolean {
  const rule = String.raw`jsdoc/require-jsdoc`;
  const prefix = String.raw`(?:es|ox)lint`;

  // A file-level directive is `disable` followed by whitespace — the lookahead
  // keeps `disable-line` and `disable-next-line` from reading as file-wide.
  const fileWide = new RegExp(`${prefix}-disable(?!-)\\s[^\\n]*${rule}`);

  if (lines.some((l) => fileWide.test(l))) return true;

  return (
    new RegExp(`${prefix}-disable-line[^\\n]*${rule}`).test(
      lines[index] ?? "",
    ) ||
    new RegExp(`${prefix}-disable-next-line[^\\n]*${rule}`).test(
      lines[index - 1] ?? "",
    )
  );
}

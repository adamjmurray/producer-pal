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

// Architectural import rules that oxlint cannot express. ESLint enforced these
// through no-restricted-syntax (arbitrary AST selectors), import-x/no-restricted-
// paths (a zone graph), and no-restricted-imports' `patterns[].regex` form — none
// of which oxlint implements. Everything else in those blocks has a native oxlint
// rule and stays in .oxlintrc.json.
//
// These replace real lint rules, so they honor disable directives the same way
// the rules did: a file-level block directive naming the rule, or a
// disable-line/disable-next-line naming it. Without that they would be STRICTER
// than what they replace, which the migration is not meant to be.
//
// Scope note: the eslint config also carried a src-wide ban on every ".."
// specifier, but the later block for the LiveAPI constructor ban replaced it —
// flat-config `rules` entries replace rather than merge, so only the last block
// for a given rule survives. That ban never actually ran, and src/ holds ~418
// relative parent imports written against its absence, so reviving it here would
// be a new rule rather than a port. Deliberately not ported; webui's identical
// ban was never shadowed and is enforced below.

/**
 * Matches the specifier of a static import/export or a dynamic import(). Group 1
 * is non-empty only for the dynamic form, which the extension rule exempts (its
 * eslint selector was ImportDeclaration, never ImportExpression).
 */
const SPECIFIER =
  /(?:\bfrom\s*|\b(import)\s*\(\s*|\bimport\s+)(["'])([^"']+)\2/g;

// This file necessarily spells out the constructor call it bans, so scanning it
// would report its own prose. It has no runtime imports to police either.
const SELF = "src/test/meta/import-restrictions.test.ts";

interface Violation {
  file: string;
  reason: string;
}

interface Specifier {
  value: string;
  line: number;
  dynamic: boolean;
}

describe("import restrictions", () => {
  it("should not use file extensions in webui relative imports", () => {
    const violations = scanSpecifiers(
      "webui/src",
      "no-restricted-syntax",
      (s, dynamic) =>
        !dynamic && /^\.\.?\/.*\.(?:jsx?|tsx?)$/.test(s)
          ? `"${s}" — webui is bundled, so relative imports carry no extension`
          : null,
    );

    throwOnFileViolations(
      violations,
      "Found extensioned relative import(s) in webui",
      "Drop the extension; the bundler resolves it.",
    );

    expect(violations).toHaveLength(0);
  });

  it("should not use parent-relative imports in webui", () => {
    const violations = scanSpecifiers(
      "webui/src",
      "no-restricted-syntax",
      (s) =>
        s.startsWith("..")
          ? `"${s}" — use the #webui/* alias instead of ../`
          : null,
    );

    throwOnFileViolations(
      violations,
      "Found ../ import(s) in webui",
      "Rewrite as #webui/*.",
    );

    expect(violations).toHaveLength(0);
  });

  it("should only let webui import from #src/shared", () => {
    const violations = scanSpecifiers(
      "webui/src",
      "@typescript-eslint/no-restricted-imports",
      (s) =>
        s.startsWith("#src/") && !s.startsWith("#src/shared/")
          ? `"${s}" — webui may only reach into #src/shared/`
          : null,
    );

    throwOnFileViolations(
      violations,
      "Found webui import(s) outside #src/shared",
      "webui runs in the browser; only src/shared is safe to share with it.",
    );

    expect(violations).toHaveLength(0);
  });

  it("should construct LiveAPI through LiveAPI.from()", () => {
    // LiveAPI.from() prefixes a bare id with "id "; the constructor requires the
    // caller to have done that already, a recurring source of bugs.
    const exempt = new Set([
      "src/live-api-adapter/live-api-extensions.ts", // defines LiveAPI.from()
      "src/test/mocks/mock-live-api.ts", // mirrors live-api-extensions.ts
      SELF,
    ]);
    const pattern = /\bnew\s+LiveAPI\s*\(/;
    const violations: Violation[] = [];

    for (const file of findSourceFiles(path.join(projectRoot, "src"))) {
      const rel = path.relative(projectRoot, file);

      if (exempt.has(rel)) continue;

      const source = fs.readFileSync(file, "utf8");
      const lines = source.split("\n");

      for (const [i, line] of lines.entries()) {
        if (!pattern.test(line)) continue;
        if (isSuppressed(lines, i, "no-restricted-syntax")) continue;

        violations.push({
          file: `${rel}:${i + 1}`,
          reason: "construct it with LiveAPI.from() instead",
        });
      }
    }

    throwOnFileViolations(
      violations,
      "Found direct LiveAPI construction",
      "LiveAPI.from() handles raw ids safely; the constructor does not.",
    );

    expect(violations).toHaveLength(0);
  });

  it("should respect the src/ layering contract", () => {
    // shared/ is the foundation every other layer depends on, and notation/ sits
    // just above it, so neither may reach back up. tools/ is the domain layer
    // that mcp-server composes, so the dependency must not run the other way.
    const zones = [
      {
        target: "src/shared",
        forbidden: [
          "tools",
          "mcp-server",
          "live-api-adapter",
          "notation",
          "portal",
        ],
        except: [],
      },
      {
        target: "src/notation",
        forbidden: ["tools", "mcp-server", "live-api-adapter", "portal"],
        except: [],
      },
      {
        target: "src/tools",
        forbidden: ["mcp-server"],
        // The shared ppal-library data contract, consumed by both the tool
        // (tools/session/library.ts) and its mcp-server-side implementation.
        except: ["mcp-server/live-library/library-types.ts"],
      },
    ];
    const violations: Violation[] = [];

    for (const { target, forbidden, except } of zones) {
      for (const file of findSourceFiles(
        path.join(projectRoot, target),
        true,
      )) {
        const rel = path.relative(projectRoot, file);

        // Tests are exempt: a test may import whatever it exercises. Fixtures
        // and case tables count as tests here, matching the paths the eslint
        // block ignored — findSourceFiles only drops the project's narrower
        // definition of a test file.
        if (/(^|\/)(tests?|test-utils|test-cases)\//.test(rel)) continue;
        if (/-test-(?:case|fixtures)\.tsx?$/.test(rel)) continue;

        const lines = fs.readFileSync(file, "utf8").split("\n");

        for (const { value, line } of specifiersIn(file)) {
          const within = pathWithinSrc(value, rel);

          if (within == null) continue;

          const layer = within.split("/")[0] ?? "";

          if (!forbidden.includes(layer)) continue;
          if (except.includes(within)) continue;

          if (isSuppressed(lines, line - 1, "import-x/no-restricted-paths")) {
            continue;
          }

          violations.push({
            file: `${rel}:${line}`,
            reason: `imports "${value}" — ${target} must not depend on src/${layer}`,
          });
        }
      }
    }

    throwOnFileViolations(
      violations,
      "Found leaf-layer violation(s)",
      "Move the shared code down into the leaf, or invert the dependency.",
    );

    expect(violations).toHaveLength(0);
  });
});

/**
 * Read every import/export specifier out of a file, with its line number
 * @param file - Absolute path to read
 * @returns The specifiers in source order
 */
function specifiersIn(file: string): Specifier[] {
  const source = fs.readFileSync(file, "utf8");

  return [...source.matchAll(SPECIFIER)].map((m) => ({
    value: m[3] as string,
    line: source.slice(0, m.index).split("\n").length,
    dynamic: m[1] != null,
  }));
}

/**
 * Whether a lint directive disables a rule for this line or the whole file.
 * Recognizes both the eslint- and oxlint- prefixes, since oxlint honors either.
 * @param lines - The file's lines
 * @param index - Zero-based index of the line being reported
 * @param rule - Rule name the directive must name
 * @returns True when the rule is suppressed there
 */
function isSuppressed(lines: string[], index: number, rule: string): boolean {
  const names = `(?:es|ox)lint`;
  const name = ruleToken(rule);
  const whole = new RegExp(`${names}-disable(?:\\s|$)[^\\n]*${name}`);

  if (lines.some((l) => whole.test(l))) return true;

  const line = new RegExp(`${names}-disable-line[^\\n]*${name}`);
  const next = new RegExp(`${names}-disable-next-line[^\\n]*${name}`);

  return line.test(lines[index] ?? "") || next.test(lines[index - 1] ?? "");
}

/**
 * Build a pattern matching a rule name as a whole token in a directive.
 * `\b` cannot delimit these: a scoped name like `@typescript-eslint/no-x` opens
 * with a non-word character, so `\b` between the leading space and the `@` never
 * matches and the rule reads as impossible to suppress.
 * @param rule - Raw rule name
 * @returns A source pattern matching that name between directive delimiters
 */
function ruleToken(rule: string): string {
  const escaped = rule.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

  // Names sit between whitespace or commas, so anchor on those rather than on
  // word boundaries, and refuse a name that is only a prefix of a longer one.
  return String.raw`(?<![^\s,])${escaped}(?![\w/-])`;
}

/**
 * Resolve a specifier to the path it names under src/, if any
 * @param spec - The import specifier
 * @param fromRel - Repo-relative path of the importing file
 * @returns The src-relative path it resolves to, or null when it names none
 */
function pathWithinSrc(spec: string, fromRel: string): string | null {
  const aliased = spec.startsWith("#src/") ? spec.slice("#src/".length) : null;
  const relative = spec.startsWith(".")
    ? path.relative(
        path.join(projectRoot, "src"),
        path.resolve(path.dirname(path.join(projectRoot, fromRel)), spec),
      )
    : null;
  const within = aliased ?? relative;

  if (within == null || within.startsWith("..")) return null;

  return within;
}

/**
 * Flag every specifier in a tree that a predicate rejects
 * @param tree - Repo-relative directory to scan
 * @param rule - Rule name a disable directive must name to suppress a hit
 * @param reject - Given the specifier and whether it is a dynamic import(),
 *   returns a reason to flag it, or null to allow it
 * @returns One violation per rejected specifier
 */
function scanSpecifiers(
  tree: string,
  rule: string,
  reject: (spec: string, dynamic: boolean) => string | null,
): Violation[] {
  const violations: Violation[] = [];

  for (const file of findSourceFiles(path.join(projectRoot, tree))) {
    const rel = path.relative(projectRoot, file);

    if (rel === SELF) continue;

    const lines = fs.readFileSync(file, "utf8").split("\n");

    for (const { value, line, dynamic } of specifiersIn(file)) {
      const reason = reject(value, dynamic);

      if (reason == null) continue;
      if (isSuppressed(lines, line - 1, rule)) continue;

      violations.push({ file: `${rel}:${line}`, reason });
    }
  }

  return violations;
}

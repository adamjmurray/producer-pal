// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  projectRoot,
  throwOnFileViolations,
} from "#src/test/helpers/meta-test-helpers.ts";

// Em dashes read as AI-written, so the docs prose uses commas, periods,
// parentheses, or a colon instead. The rest are here because they show up in
// the same paste: an en dash in a range, a minus sign copied from a device
// readout, a non-breaking hyphen from a word processor. Plain ASCII `-`
// replaces all of them.
const BANNED_CHARACTERS = new Map([
  ["‐", "hyphen (U+2010)"],
  ["‑", "non-breaking hyphen (U+2011)"],
  ["‒", "figure dash (U+2012)"],
  ["–", "en dash (U+2013)"],
  ["—", "em dash (U+2014)"],
  ["―", "horizontal bar (U+2015)"],
  ["⁃", "hyphen bullet (U+2043)"],
  ["−", "minus sign (U+2212)"],
  ["⸺", "two-em dash (U+2E3A)"],
  ["⸻", "three-em dash (U+2E3B)"],
  ["﹘", "small em dash (U+FE58)"],
  ["﹣", "small hyphen-minus (U+FE63)"],
  ["－", "fullwidth hyphen-minus (U+FF0D)"],
]);

const BANNED_PATTERN = new RegExp(
  `[${[...BANNED_CHARACTERS.keys()].join("")}]`,
  "gu",
);

const DOCS_DIR = path.join(projectRoot, "docs");

// Build output and generated partials. `_generated` comes from the tool
// schemas, so its wording is governed by the `.def.ts` files, not by this rule.
const SKIPPED_DIRECTORIES = new Set([
  "_generated",
  "public",
  ".vitepress",
  "node_modules",
]);

// Installation pages are exempt: they were written before the rule and read
// fine. Partials are only exempt while every page including them is an
// installation page, so a new partial is covered until it's listed here.
const INSTALLATION_PAGES = "installation";
const INSTALLATION_ONLY_PARTIALS = new Set([
  "_partials/agent-skill-callout.md",
  "_partials/download-device.md",
  "_partials/live-requirement.md",
  "_partials/live-version.md",
  "_partials/scripting-tip.md",
]);

describe("no typographic dashes in the docs site", () => {
  it("should not use em dashes, en dashes, or their relatives", () => {
    const violations = findBannedCharacters(findCoveredPages());

    throwOnFileViolations(
      violations,
      "Found typographic dash character(s) in the docs",
      "Use a plain ASCII hyphen for ranges, and rewrite an em dash as a " +
        "comma, a period, parentheses, or a colon. Installation pages are " +
        "exempt; see the exemption list in this test.",
    );

    expect(violations).toHaveLength(0);
  });

  it("should cover the pages a reader actually sees", () => {
    const covered = findCoveredPages().map((file) =>
      path.relative(DOCS_DIR, file),
    );

    expect(covered).toContain("index.md");
    expect(covered).toContain("guide/chat-ui.md");
    expect(covered.some((file) => file.startsWith("installation"))).toBe(false);
  });
});

/**
 * List the Markdown pages this rule applies to
 * @returns Absolute paths of the docs pages under the rule
 */
function findCoveredPages(): string[] {
  return findMarkdownFiles(DOCS_DIR).filter((file) => {
    const relativePath = path.relative(DOCS_DIR, file);

    return (
      !relativePath.startsWith(INSTALLATION_PAGES) &&
      !INSTALLATION_ONLY_PARTIALS.has(relativePath)
    );
  });
}

/**
 * Recursively collect Markdown files, skipping generated and build folders
 * @param directory - Directory to scan
 * @returns Absolute paths of every Markdown file found
 */
function findMarkdownFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name)
        ? []
        : findMarkdownFiles(fullPath);
    }

    return entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

/**
 * Find every banned character in the given files
 * @param files - Absolute paths to scan
 * @returns One violation per offending character, located by line and column
 */
function findBannedCharacters(
  files: string[],
): { file: string; reason: string }[] {
  return files.flatMap((file) =>
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, lineIndex) =>
        [...line.matchAll(BANNED_PATTERN)].map((match) => ({
          file: `${path.relative(projectRoot, file)}:${lineIndex + 1}:${match.index + 1}`,
          reason: `${BANNED_CHARACTERS.get(match[0])} in "${line.trim()}"`,
        })),
      ),
  );
}

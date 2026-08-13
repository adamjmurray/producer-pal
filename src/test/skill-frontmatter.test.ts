// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { globSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// The example skills ship as-is to users, and a skill loader reads this
// frontmatter before anything else — invalid YAML means the skill is rejected
// or misregistered, with nothing in the repo to catch it. A plain multi-line
// scalar is the easy way in: an unquoted `: ` inside one ends the implicit key
// and throws. Use a quoted or `>-` folded scalar for prose.
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;

describe("example skill frontmatter", () => {
  const skillFiles = globSync("examples/skills/*/SKILL.md").sort();

  it("finds the example skills", () => {
    expect(skillFiles.length).toBeGreaterThan(0);
  });

  for (const file of skillFiles) {
    const source = readFileSync(file, "utf-8");
    const block = FRONTMATTER.exec(source)?.[1];

    it(`${file} opens with a YAML frontmatter block`, () => {
      expect(block).toBeDefined();
    });

    it(`${file} parses as YAML`, () => {
      expect(() => parse(block as string)).not.toThrow();
    });

    it(`${file} declares a name matching its directory, and a description`, () => {
      const frontmatter = parse(block as string) as Record<string, unknown>;

      expect(frontmatter.name).toBe(path.basename(path.dirname(file)));
      expect(typeof frontmatter.description).toBe("string");
      expect((frontmatter.description as string).trim()).not.toBe("");
    });
  }
});

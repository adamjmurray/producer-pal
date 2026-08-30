// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { useTempConfigDir } from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import {
  customSkillExists,
  forgetCustomSkill,
  listCustomSkills,
  readCustomSkill,
  regenerateSkillsIndex,
  rememberCustomSkill,
  renderEnabledSkillsIndex,
  slugifyCustomSkillName,
} from "../custom-skills-store.ts";

const getDir = useTempConfigDir();

/**
 * Absolute path to a file inside the temp skills-custom dir.
 * @param file - Basename under skills-custom/ (e.g. "jazz-voicings.md")
 * @returns Absolute file path
 */
function skillPath(file: string): string {
  return join(getDir(), "skills-custom", file);
}

/**
 * Write a raw skill file (bypassing the store) to simulate hand editing.
 * @param file - Basename under skills-custom/
 * @param contents - Raw file contents
 */
function writeRaw(file: string, contents: string): void {
  mkdirSync(join(getDir(), "skills-custom"), { recursive: true });
  writeFileSync(skillPath(file), contents);
}

describe("slugifyCustomSkillName", () => {
  it("lowercases and hyphenates arbitrary names", () => {
    expect(slugifyCustomSkillName("Jazz Voicings!")).toBe("jazz-voicings");
  });

  it("trims leading/trailing separators and collapses runs", () => {
    expect(slugifyCustomSkillName("  --My: Drum Style--  ")).toBe(
      "my-drum-style",
    );
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(slugifyCustomSkillName("!!!")).toBe("");
  });

  it("neutralizes path traversal attempts", () => {
    expect(slugifyCustomSkillName("../../etc/passwd")).toBe("etc-passwd");
  });
});

describe("rememberCustomSkill", () => {
  it("writes a frontmatter'd file (enabled by default) and returns the entry", () => {
    const entry = rememberCustomSkill({
      name: "Jazz Voicings",
      description: "rich chord voicings",
      body: "  Voice chords with the 3rd and 7th.  ",
    });

    expect(entry).toStrictEqual({
      name: "jazz-voicings",
      description: "rich chord voicings",
      enabled: true,
      body: "Voice chords with the 3rd and 7th.",
    });

    const raw = readFileSync(skillPath("jazz-voicings.md"), "utf8");

    expect(raw.startsWith("---\n")).toBe(true);
    expect(raw).toContain("name: jazz-voicings");
    expect(raw).toContain("enabled: true");
    expect(raw.trimEnd().endsWith("Voice chords with the 3rd and 7th.")).toBe(
      true,
    );
  });

  it("stores an explicit enabled:false flag", () => {
    const entry = rememberCustomSkill({
      name: "wip",
      description: "half-baked",
      body: "Draft.",
      enabled: false,
    });

    expect(entry.enabled).toBe(false);
    expect(readFileSync(skillPath("wip.md"), "utf8")).toContain(
      "enabled: false",
    );
  });

  it("preserves the existing enabled flag on update when omitted", () => {
    rememberCustomSkill({
      name: "s",
      description: "d",
      body: "first",
      enabled: false,
    });
    // A body edit with no `enabled` must not silently re-enable the skill.
    rememberCustomSkill({ name: "s", description: "d2", body: "second" });

    expect(readCustomSkill("s")).toStrictEqual({
      name: "s",
      enabled: false,
      body: "second",
      description: "d2",
    });
  });

  it("collapses multi-line/whitespace descriptions to a single line", () => {
    const entry = rememberCustomSkill({
      name: "loose",
      description: "swing  and\nhumanize   drums",
      body: "Apply groove.",
    });

    expect(entry.description).toBe("swing and humanize drums");
  });

  it("overwrites in place when the same slug is remembered again", () => {
    rememberCustomSkill({ name: "voicings", description: "v1", body: "first" });
    rememberCustomSkill({
      name: "Voicings",
      description: "v2",
      body: "second",
    });

    expect(listCustomSkills()).toHaveLength(1);
    expect(readCustomSkill("voicings")?.body).toBe("second");
  });

  it("throws when the name has no usable characters", () => {
    expect(() =>
      rememberCustomSkill({ name: "!!!", description: "x", body: "y" }),
    ).toThrow(/name must contain/i);
  });

  it("throws on an empty body", () => {
    expect(() =>
      rememberCustomSkill({ name: "x", description: "x", body: "   " }),
    ).toThrow(/body must not be empty/i);
  });

  it("rejects the reserved index name so SKILLS.md can't be clobbered", () => {
    rememberCustomSkill({ name: "keeper", description: "d", body: "b" });

    // All slugify to "skills", the index file's basename. On a case-insensitive
    // filesystem this would overwrite the index; the guard throws before any
    // write on every platform.
    for (const name of ["skills", "Skills", "SKILLS", "  skills!  "]) {
      expect(() =>
        rememberCustomSkill({ name, description: "x", body: "y" }),
      ).toThrow(/reserved/i);
    }

    expect(readCustomSkill("keeper")?.body).toBe("b");
    expect(readFileSync(skillPath("SKILLS.md"), "utf8")).toContain("keeper");
  });
});

describe("readCustomSkill", () => {
  it("reads a stored skill by an un-slugified name", () => {
    rememberCustomSkill({
      name: "jazz-voicings",
      description: "rich voicings",
      body: "Voice with 3rds and 7ths.",
    });

    expect(readCustomSkill("Jazz Voicings")).toStrictEqual({
      name: "jazz-voicings",
      description: "rich voicings",
      enabled: true,
      body: "Voice with 3rds and 7ths.",
    });
  });

  it("returns null for a missing skill", () => {
    expect(readCustomSkill("nope")).toBeNull();
  });

  it("returns null for an unslugifiable name", () => {
    expect(readCustomSkill("!!!")).toBeNull();
  });

  it("returns null for the reserved index name", () => {
    rememberCustomSkill({ name: "keeper", description: "d", body: "b" });

    expect(readCustomSkill("skills")).toBeNull();
    expect(readCustomSkill("SKILLS")).toBeNull();
  });

  it("reads a hand-authored file, taking the slug from the filename", () => {
    writeRaw(
      "hand.md",
      "---\ndescription: hand written\nenabled: false\n---\n\nBe terse.",
    );

    expect(readCustomSkill("hand")).toStrictEqual({
      name: "hand",
      description: "hand written",
      enabled: false,
      body: "Be terse.",
    });
  });

  it("defaults enabled to true and description to '' for a bare file", () => {
    writeRaw("bare.md", "Just a body, no frontmatter.");

    expect(readCustomSkill("bare")).toStrictEqual({
      name: "bare",
      description: "",
      enabled: true,
      body: "Just a body, no frontmatter.",
    });
  });
});

describe("customSkillExists", () => {
  it("is true for a stored skill (matching by an un-slugified name)", () => {
    rememberCustomSkill({ name: "jazz-voicings", description: "", body: "b" });

    expect(customSkillExists("Jazz Voicings")).toBe(true);
  });

  it("is false for a missing skill", () => {
    expect(customSkillExists("nope")).toBe(false);
  });

  it("is false for an unslugifiable name", () => {
    expect(customSkillExists("!!!")).toBe(false);
  });

  it("is false for the reserved index name", () => {
    rememberCustomSkill({ name: "keeper", description: "", body: "b" });

    expect(customSkillExists("skills")).toBe(false);
  });
});

describe("listCustomSkills", () => {
  it("is empty when there are no skills", () => {
    expect(listCustomSkills()).toStrictEqual([]);
  });

  it("sorts by name, skipping the index file", () => {
    rememberCustomSkill({ name: "zeta", description: "", body: "b" });
    rememberCustomSkill({ name: "alpha", description: "", body: "b" });
    rememberCustomSkill({ name: "mid", description: "", body: "b" });

    expect(listCustomSkills().map((e) => e.name)).toStrictEqual([
      "alpha",
      "mid",
      "zeta",
    ]);
  });

  it("excludes the index filename case-insensitively", () => {
    // A hand-created lowercase "skills.md" is a distinct file from "SKILLS.md"
    // on case-sensitive Linux; the filter must still treat it as the index.
    writeRaw("skills.md", "---\nenabled: true\n---\n\nreserved");
    rememberCustomSkill({ name: "real", description: "", body: "b" });

    expect(listCustomSkills().map((e) => e.name)).toStrictEqual(["real"]);
  });
});

describe("forgetCustomSkill", () => {
  it("removes an existing skill and reports it existed", () => {
    rememberCustomSkill({ name: "temp", description: "", body: "b" });

    expect(forgetCustomSkill("Temp")).toBe(true);
    expect(readCustomSkill("temp")).toBeNull();
  });

  it("reports false for a missing skill", () => {
    expect(forgetCustomSkill("ghost")).toBe(false);
  });

  it("reports false for an unslugifiable name", () => {
    expect(forgetCustomSkill("!!!")).toBe(false);
  });

  it("refuses to forget the reserved index name", () => {
    rememberCustomSkill({ name: "keeper", description: "d", body: "b" });

    expect(forgetCustomSkill("skills")).toBe(false);
    expect(readFileSync(skillPath("SKILLS.md"), "utf8")).toContain("keeper");
  });
});

describe("regenerateSkillsIndex / SKILLS.md", () => {
  it("lists enabled skills, with a Disabled section for the rest", () => {
    rememberCustomSkill({
      name: "jazz-voicings",
      description: "rich voicings",
      body: "b",
    });
    rememberCustomSkill({
      name: "wip",
      description: "half-baked",
      body: "b",
      enabled: false,
    });

    const index = regenerateSkillsIndex();

    expect(index).toBe(
      "# Producer Pal Custom Skills\n\n" +
        "- `jazz-voicings` — rich voicings\n\n" +
        "## Disabled\n\n- `wip` — half-baked\n",
    );
    expect(readFileSync(skillPath("SKILLS.md"), "utf8")).toBe(index);
  });

  it("omits the description dash when a skill has no description", () => {
    rememberCustomSkill({ name: "bare", description: "", body: "b" });

    expect(regenerateSkillsIndex()).toContain("- `bare`\n");
  });

  it("emits no Disabled section when every skill is enabled", () => {
    // The `## Disabled` section is only appended when disabled.length > 0 — with
    // all skills enabled the section must be absent entirely, not a bare header.
    rememberCustomSkill({ name: "one", description: "d", body: "b" });
    rememberCustomSkill({ name: "two", description: "d", body: "b" });

    expect(regenerateSkillsIndex()).not.toContain("## Disabled");
  });

  it("deletes the index and returns '' when the last skill is forgotten", () => {
    rememberCustomSkill({ name: "solo", description: "d", body: "b" });
    forgetCustomSkill("solo");

    expect(regenerateSkillsIndex()).toBe("");
    expect(readCustomSkill("SKILLS")).toBeNull();
  });
});

describe("renderEnabledSkillsIndex", () => {
  it("includes only enabled entries as index lines", () => {
    rememberCustomSkill({ name: "on", description: "shown", body: "b" });
    rememberCustomSkill({
      name: "off",
      description: "hidden",
      body: "b",
      enabled: false,
    });

    expect(renderEnabledSkillsIndex(listCustomSkills())).toBe("- `on` — shown");
  });

  it("returns '' when nothing is enabled", () => {
    rememberCustomSkill({
      name: "off",
      description: "hidden",
      body: "b",
      enabled: false,
    });

    expect(renderEnabledSkillsIndex(listCustomSkills())).toBe("");
  });
});

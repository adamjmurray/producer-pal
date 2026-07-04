// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  forgetMemory,
  listMemoryEntries,
  readMemoryEntry,
  regenerateIndex,
  rememberMemory,
  type RememberMemoryInput,
  slugifyMemoryName,
} from "#src/mcp-server/helpers/memory/global-memory-store.ts";
import { useTempConfigDir } from "../config-dir-test-helpers.ts";

const getDir = useTempConfigDir();

/**
 * Absolute path to a file inside the temp memory dir.
 * @param file - Basename under memory/ (e.g. "prefers-c-minor.md")
 * @returns Absolute file path
 */
function memoryPath(file: string): string {
  return join(getDir(), "memory", file);
}

/**
 * Write a raw memory file (bypassing the store) to simulate hand editing.
 * @param file - Basename under memory/
 * @param contents - Raw file contents
 */
function writeRaw(file: string, contents: string): void {
  mkdirSync(join(getDir(), "memory"), { recursive: true });
  writeFileSync(memoryPath(file), contents);
}

describe("slugifyMemoryName", () => {
  it("lowercases and hyphenates arbitrary names", () => {
    expect(slugifyMemoryName("Prefers C Minor!")).toBe("prefers-c-minor");
  });

  it("trims leading/trailing separators and collapses runs", () => {
    expect(slugifyMemoryName("  --Album: Nyx--  ")).toBe("album-nyx");
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(slugifyMemoryName("!!!")).toBe("");
  });

  it("neutralizes path traversal attempts", () => {
    expect(slugifyMemoryName("../../etc/passwd")).toBe("etc-passwd");
  });
});

describe("rememberMemory", () => {
  it("writes a frontmatter'd file and returns the stored entry", () => {
    const entry = rememberMemory({
      name: "Prefers C Minor",
      type: "user",
      description: "default key & genre",
      body: "  Composes mostly in C minor, house/techno.  ",
    });

    expect(entry).toStrictEqual({
      name: "prefers-c-minor",
      type: "user",
      description: "default key & genre",
      body: "Composes mostly in C minor, house/techno.",
    });

    const raw = readFileSync(memoryPath("prefers-c-minor.md"), "utf8");

    expect(raw.startsWith("---\n")).toBe(true);
    expect(raw).toContain("name: prefers-c-minor");
    expect(raw).toContain("type: user");
    expect(
      raw.trimEnd().endsWith("Composes mostly in C minor, house/techno."),
    ).toBe(true);
  });

  it("collapses multi-line/whitespace descriptions to a single line", () => {
    const entry = rememberMemory({
      name: "loose-drums",
      type: "feedback",
      description: "swing  and\nhumanize   drums",
      body: "Apply groove.",
    });

    expect(entry.description).toBe("swing and humanize drums");
  });

  it("overwrites in place when the same slug is remembered again", () => {
    rememberMemory({
      name: "album-nyx",
      type: "project",
      description: "v1",
      body: "first",
    });
    rememberMemory({
      name: "Album Nyx",
      type: "project",
      description: "v2",
      body: "second",
    });

    expect(listMemoryEntries()).toHaveLength(1);
    expect(readMemoryEntry("album-nyx")?.body).toBe("second");
  });

  it("throws when the name has no usable characters", () => {
    expect(() =>
      rememberMemory({
        name: "!!!",
        type: "user",
        description: "x",
        body: "y",
      }),
    ).toThrow(/name must contain/i);
  });

  it("throws on an invalid type", () => {
    const badInput = {
      name: "x",
      type: "bogus",
      description: "x",
      body: "y",
    } as unknown as RememberMemoryInput;

    expect(() => rememberMemory(badInput)).toThrow(/invalid memory type/i);
  });

  it("throws on an empty body", () => {
    expect(() =>
      rememberMemory({
        name: "x",
        type: "user",
        description: "x",
        body: "   ",
      }),
    ).toThrow(/body must not be empty/i);
  });
});

describe("readMemoryEntry", () => {
  it("reads a stored memory by an un-slugified name", () => {
    rememberMemory({
      name: "kick-samples",
      type: "reference",
      description: "analog kicks",
      body: "In ~/Samples/Analog.",
    });

    expect(readMemoryEntry("Kick Samples")).toStrictEqual({
      name: "kick-samples",
      type: "reference",
      description: "analog kicks",
      body: "In ~/Samples/Analog.",
    });
  });

  it("returns null for a missing memory", () => {
    expect(readMemoryEntry("nope")).toBeNull();
  });

  it("returns null for an unslugifiable name", () => {
    expect(readMemoryEntry("!!!")).toBeNull();
  });

  it("reads a hand-authored file, taking the slug from the filename", () => {
    writeRaw(
      "hand-note.md",
      "---\ndescription: hand written\ntype: feedback\n---\n\nBe terse.",
    );

    expect(readMemoryEntry("hand-note")).toStrictEqual({
      name: "hand-note",
      type: "feedback",
      description: "hand written",
      body: "Be terse.",
    });
  });

  it("coerces a missing/invalid type to reference and defaults description", () => {
    writeRaw("no-fm.md", "Just a body, no frontmatter.");

    expect(readMemoryEntry("no-fm")).toStrictEqual({
      name: "no-fm",
      type: "reference",
      description: "",
      body: "Just a body, no frontmatter.",
    });
  });
});

describe("listMemoryEntries", () => {
  it("is empty when there are no memories", () => {
    expect(listMemoryEntries()).toStrictEqual([]);
  });

  it("sorts by type order then name, skipping the index file", () => {
    rememberMemory({
      name: "z-fb",
      type: "feedback",
      description: "",
      body: "b",
    });
    rememberMemory({
      name: "a-fb",
      type: "feedback",
      description: "",
      body: "b",
    });
    rememberMemory({ name: "u", type: "user", description: "", body: "b" });
    rememberMemory({
      name: "r",
      type: "reference",
      description: "",
      body: "b",
    });

    expect(listMemoryEntries().map((e) => e.name)).toStrictEqual([
      "u",
      "a-fb",
      "z-fb",
      "r",
    ]);
  });
});

describe("forgetMemory", () => {
  it("removes an existing memory and reports it existed", () => {
    rememberMemory({ name: "temp", type: "user", description: "", body: "b" });

    expect(forgetMemory("Temp")).toBe(true);
    expect(readMemoryEntry("temp")).toBeNull();
  });

  it("reports false for a missing memory", () => {
    expect(forgetMemory("ghost")).toBe(false);
  });

  it("reports false for an unslugifiable name", () => {
    expect(forgetMemory("!!!")).toBe(false);
  });
});

describe("regenerateIndex / MEMORY.md", () => {
  it("groups entries by type under headings with description hooks", () => {
    rememberMemory({
      name: "prefers-c-minor",
      type: "user",
      description: "default key & genre",
      body: "b",
    });
    rememberMemory({
      name: "loose-drums",
      type: "feedback",
      description: "swing/humanize",
      body: "b",
    });

    const index = regenerateIndex();

    expect(index).toBe(
      "# Producer Pal Memory\n\n" +
        "## User\n\n- `prefers-c-minor` — default key & genre\n\n" +
        "## Feedback\n\n- `loose-drums` — swing/humanize\n",
    );
    expect(readFileSync(memoryPath("MEMORY.md"), "utf8")).toBe(index);
  });

  it("omits the description dash when a memory has no description", () => {
    rememberMemory({ name: "bare", type: "user", description: "", body: "b" });

    expect(regenerateIndex()).toContain("- `bare`\n");
  });

  it("deletes the index and returns '' when the last memory is forgotten", () => {
    rememberMemory({ name: "solo", type: "user", description: "d", body: "b" });
    forgetMemory("solo");

    expect(regenerateIndex()).toBe("");
    expect(readMemoryEntry("MEMORY")).toBeNull();
  });
});

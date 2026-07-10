// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  forgetMemory,
  listMemoryEntries,
  memoryExists,
  readMemoryEntry,
  regenerateIndex,
  rememberMemory,
  renameMemory,
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
      description: "default key & genre",
      body: "  Composes mostly in C minor, house/techno.  ",
    });

    expect(entry).toStrictEqual({
      name: "prefers-c-minor",
      description: "default key & genre",
      body: "Composes mostly in C minor, house/techno.",
    });

    const raw = readFileSync(memoryPath("prefers-c-minor.md"), "utf8");

    expect(raw.startsWith("---\n")).toBe(true);
    expect(raw).toContain("name: prefers-c-minor");
    expect(
      raw.trimEnd().endsWith("Composes mostly in C minor, house/techno."),
    ).toBe(true);
  });

  it("collapses multi-line/whitespace descriptions to a single line", () => {
    const entry = rememberMemory({
      name: "loose-drums",
      description: "swing  and\nhumanize   drums",
      body: "Apply groove.",
    });

    expect(entry.description).toBe("swing and humanize drums");
  });

  it("overwrites in place when the same slug is remembered again", () => {
    rememberMemory({
      name: "album-nyx",
      description: "v1",
      body: "first",
    });
    rememberMemory({
      name: "Album Nyx",
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
        description: "x",
        body: "y",
      }),
    ).toThrow(/name must contain/i);
  });

  it("throws on an empty body", () => {
    expect(() =>
      rememberMemory({
        name: "x",
        description: "x",
        body: "   ",
      }),
    ).toThrow(/body must not be empty/i);
  });

  it("rejects the reserved index name so MEMORY.md can't be clobbered", () => {
    rememberMemory({
      name: "keeper",
      description: "d",
      body: "b",
    });

    // All slugify to "memory", which is the index file's basename. On a
    // case-insensitive filesystem this would overwrite the index; the guard
    // throws before any write on every platform.
    for (const name of ["memory", "Memory", "MEMORY", "  memory!  "]) {
      expect(() =>
        rememberMemory({ name, description: "x", body: "y" }),
      ).toThrow(/reserved/i);
    }

    expect(readMemoryEntry("keeper")?.body).toBe("b");
    expect(readFileSync(memoryPath("MEMORY.md"), "utf8")).toContain("keeper");
  });
});

describe("renameMemory", () => {
  it("moves the file to the new slug, preserving fields, and rebuilds the index", () => {
    rememberMemory({ name: "old-name", description: "d", body: "the fact" });

    const renamed = renameMemory("old-name", {
      name: "New Name",
      description: "d",
      body: "the fact",
    });

    expect(renamed).toStrictEqual({
      name: "new-name",
      description: "d",
      body: "the fact",
    });
    expect(readMemoryEntry("old-name")).toBeNull();
    expect(existsSync(memoryPath("old-name.md"))).toBe(false);
    expect(readMemoryEntry("new-name")?.body).toBe("the fact");

    const index = readFileSync(memoryPath("MEMORY.md"), "utf8");

    expect(index).toContain("new-name");
    expect(index).not.toContain("old-name");
  });

  it("persists edited fields sent alongside the rename", () => {
    rememberMemory({ name: "draft", description: "old", body: "old body" });

    const renamed = renameMemory("draft", {
      name: "final",
      description: "new hook",
      body: "new body",
    });

    expect(renamed).toStrictEqual({
      name: "final",
      description: "new hook",
      body: "new body",
    });
  });

  it("updates in place when the slug is unchanged (a no-op rename)", () => {
    rememberMemory({ name: "keep", description: "old", body: "old" });

    const renamed = renameMemory("keep", {
      name: "Keep",
      description: "updated",
      body: "updated body",
    });

    expect(renamed.name).toBe("keep");
    expect(listMemoryEntries()).toHaveLength(1);
    expect(readMemoryEntry("keep")?.body).toBe("updated body");
  });

  it("throws on a collision with a different existing memory, touching neither", () => {
    rememberMemory({ name: "one", description: "", body: "b1" });
    rememberMemory({ name: "two", description: "", body: "b2" });

    expect(() =>
      renameMemory("one", { name: "two", description: "", body: "b1" }),
    ).toThrow(/already exists/i);
    expect(readMemoryEntry("one")?.body).toBe("b1");
    expect(readMemoryEntry("two")?.body).toBe("b2");
  });

  it("rejects an unslugifiable or reserved new name, leaving the source intact", () => {
    rememberMemory({ name: "src", description: "", body: "b" });

    expect(() =>
      renameMemory("src", { name: "!!!", description: "", body: "b" }),
    ).toThrow(/name must contain/i);
    expect(() =>
      renameMemory("src", { name: "memory", description: "", body: "b" }),
    ).toThrow(/reserved/i);
    expect(readMemoryEntry("src")?.body).toBe("b");
  });

  it("rejects an empty body", () => {
    rememberMemory({ name: "src", description: "", body: "b" });

    expect(() =>
      renameMemory("src", { name: "dst", description: "", body: "  " }),
    ).toThrow(/body must not be empty/i);
  });
});

describe("readMemoryEntry", () => {
  it("reads a stored memory by an un-slugified name", () => {
    rememberMemory({
      name: "kick-samples",
      description: "analog kicks",
      body: "In ~/Samples/Analog.",
    });

    expect(readMemoryEntry("Kick Samples")).toStrictEqual({
      name: "kick-samples",
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

  it("returns null for the reserved index name", () => {
    rememberMemory({
      name: "keeper",
      description: "d",
      body: "b",
    });

    expect(readMemoryEntry("memory")).toBeNull();
    expect(readMemoryEntry("MEMORY")).toBeNull();
  });

  it("reads a hand-authored file, taking the slug from the filename", () => {
    writeRaw(
      "hand-note.md",
      "---\ndescription: hand written\n---\n\nBe terse.",
    );

    expect(readMemoryEntry("hand-note")).toStrictEqual({
      name: "hand-note",
      description: "hand written",
      body: "Be terse.",
    });
  });

  it("defaults a missing description to an empty string", () => {
    writeRaw("no-fm.md", "Just a body, no frontmatter.");

    expect(readMemoryEntry("no-fm")).toStrictEqual({
      name: "no-fm",
      description: "",
      body: "Just a body, no frontmatter.",
    });
  });

  it("ignores a legacy `type:` frontmatter line and still parses the entry", () => {
    writeRaw(
      "legacy.md",
      "---\ndescription: from before the type axis\ntype: feedback\n---\n\nStill readable.",
    );

    expect(readMemoryEntry("legacy")).toStrictEqual({
      name: "legacy",
      description: "from before the type axis",
      body: "Still readable.",
    });
  });
});

describe("listMemoryEntries", () => {
  it("is empty when there are no memories", () => {
    expect(listMemoryEntries()).toStrictEqual([]);
  });

  it("sorts alphabetically by name, skipping the index file", () => {
    rememberMemory({ name: "z-fb", description: "", body: "b" });
    rememberMemory({ name: "a-fb", description: "", body: "b" });
    rememberMemory({ name: "u", description: "", body: "b" });
    rememberMemory({ name: "r", description: "", body: "b" });

    expect(listMemoryEntries().map((e) => e.name)).toStrictEqual([
      "a-fb",
      "r",
      "u",
      "z-fb",
    ]);
  });

  it("excludes the index filename case-insensitively", () => {
    // A hand-created lowercase "memory.md" is a distinct file from "MEMORY.md"
    // on case-sensitive Linux; the filter must still treat it as the index.
    writeRaw("memory.md", "---\ndescription: reserved\n---\n\nreserved");
    rememberMemory({ name: "real", description: "", body: "b" });

    expect(listMemoryEntries().map((e) => e.name)).toStrictEqual(["real"]);
  });
});

describe("memoryExists", () => {
  it("is true for a stored memory (matching by an un-slugified name)", () => {
    rememberMemory({
      name: "album-nyx",
      description: "",
      body: "b",
    });

    expect(memoryExists("Album Nyx")).toBe(true);
  });

  it("is false for a missing memory", () => {
    expect(memoryExists("nope")).toBe(false);
  });

  it("is false for an unslugifiable name", () => {
    expect(memoryExists("!!!")).toBe(false);
  });

  it("is false for the reserved index name", () => {
    rememberMemory({
      name: "keeper",
      description: "",
      body: "b",
    });

    // MEMORY.md exists on disk, but it is the derived index, not a memory —
    // callers fall through to the store's specific "reserved" error instead.
    expect(memoryExists("memory")).toBe(false);
  });
});

describe("forgetMemory", () => {
  it("removes an existing memory and reports it existed", () => {
    rememberMemory({ name: "temp", description: "", body: "b" });

    expect(forgetMemory("Temp")).toBe(true);
    expect(readMemoryEntry("temp")).toBeNull();
  });

  it("reports false for a missing memory", () => {
    expect(forgetMemory("ghost")).toBe(false);
  });

  it("reports false for an unslugifiable name", () => {
    expect(forgetMemory("!!!")).toBe(false);
  });

  it("refuses to forget the reserved index name", () => {
    rememberMemory({
      name: "keeper",
      description: "d",
      body: "b",
    });

    expect(forgetMemory("memory")).toBe(false);
    expect(readFileSync(memoryPath("MEMORY.md"), "utf8")).toContain("keeper");
  });
});

describe("hand-authored non-canonical filenames", () => {
  it("lists, reads, and matches a freely-named file under its canonical slug", () => {
    writeRaw(
      "Kick Drum Samples.md",
      "---\ndescription: analog kicks\n---\n\nIn ~/Samples/Analog.",
    );

    expect(listMemoryEntries().map((e) => e.name)).toStrictEqual([
      "kick-drum-samples",
    ]);
    expect(readMemoryEntry("kick-drum-samples")).toStrictEqual({
      name: "kick-drum-samples",
      description: "analog kicks",
      body: "In ~/Samples/Analog.",
    });
    expect(memoryExists("Kick Drum Samples")).toBe(true);
  });

  it("updates a freely-named file in place instead of creating a duplicate", () => {
    writeRaw("Kick Drum Samples.md", "---\ndescription: old\n---\n\nold body");

    rememberMemory({
      name: "kick-drum-samples",
      description: "new",
      body: "new body",
    });

    expect(listMemoryEntries()).toHaveLength(1);
    expect(readMemoryEntry("kick-drum-samples")?.body).toBe("new body");
    // Written back to the original file — no canonical duplicate created.
    expect(existsSync(memoryPath("kick-drum-samples.md"))).toBe(false);
    expect(readFileSync(memoryPath("Kick Drum Samples.md"), "utf8")).toContain(
      "new body",
    );
  });

  it("forgets a freely-named file", () => {
    writeRaw("Kick Drum Samples.md", "---\ndescription: x\n---\n\nbody");

    expect(forgetMemory("kick-drum-samples")).toBe(true);
    expect(listMemoryEntries()).toStrictEqual([]);
  });
});

describe("regenerateIndex / MEMORY.md", () => {
  it("renders a flat, alphabetical-by-name index with description hooks", () => {
    rememberMemory({
      name: "prefers-c-minor",
      description: "default key & genre",
      body: "b",
    });
    rememberMemory({
      name: "loose-drums",
      description: "swing/humanize",
      body: "b",
    });

    const index = regenerateIndex();

    expect(index).toBe(
      "# Producer Pal Memory\n\n" +
        "- `loose-drums` — swing/humanize\n" +
        "- `prefers-c-minor` — default key & genre\n",
    );
    expect(readFileSync(memoryPath("MEMORY.md"), "utf8")).toBe(index);
  });

  it("omits the description dash when a memory has no description", () => {
    rememberMemory({ name: "bare", description: "", body: "b" });

    expect(regenerateIndex()).toContain("- `bare`\n");
  });

  it("deletes the index and returns '' when the last memory is forgotten", () => {
    rememberMemory({ name: "solo", description: "d", body: "b" });
    forgetMemory("solo");

    expect(regenerateIndex()).toBe("");
    expect(readMemoryEntry("MEMORY")).toBeNull();
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  listConfigMarkdownFiles,
  listConfigMarkdownFilesRecursive,
} from "#src/mcp-server/helpers/markdown-store/config-markdown-store.ts";
import { useTempConfigDir } from "./config-dir-test-helpers.ts";

const getDir = useTempConfigDir();

/**
 * Create the subdir and drop a file into it.
 * @param subdir - Subdirectory under the config dir
 * @param file - Basename to create
 */
function writeInSubdir(subdir: string, file: string): void {
  mkdirSync(join(getDir(), subdir), { recursive: true });
  writeFileSync(join(getDir(), subdir, file), "x");
}

describe("listConfigMarkdownFiles", () => {
  it("returns sorted .md basenames, ignoring other files", () => {
    writeInSubdir("memory", "b.md");
    writeInSubdir("memory", "a.md");
    writeInSubdir("memory", "notes.txt");

    expect(listConfigMarkdownFiles("memory")).toStrictEqual(["a.md", "b.md"]);
  });

  it("returns [] when the subdir is missing", () => {
    expect(listConfigMarkdownFiles("memory")).toStrictEqual([]);
  });

  it("throws when the path is present but not a directory", () => {
    writeFileSync(join(getDir(), "memory"), "not a dir");

    expect(() => listConfigMarkdownFiles("memory")).toThrow();
  });

  it("is inert under Vitest without a dir override", () => {
    delete process.env.PRODUCER_PAL_CONFIG_DIR;

    expect(listConfigMarkdownFiles("memory")).toStrictEqual([]);
  });

  it("does not descend into nested folders", () => {
    writeInSubdir("skills", "core.md");
    writeInSubdir("skills/drums", "backbeat.md");

    expect(listConfigMarkdownFiles("skills")).toStrictEqual(["core.md"]);
  });
});

describe("listConfigMarkdownFilesRecursive", () => {
  it("descends into folders, returning sorted POSIX relative paths", () => {
    writeInSubdir("skills", "core.md");
    writeInSubdir("skills/drums", "backbeat.md");
    writeInSubdir("skills/drums", "notes.txt"); // non-.md ignored

    expect(listConfigMarkdownFilesRecursive("skills")).toStrictEqual([
      "core.md",
      "drums/backbeat.md",
    ]);
  });

  it("returns [] when the subdir is missing", () => {
    expect(listConfigMarkdownFilesRecursive("skills")).toStrictEqual([]);
  });
});

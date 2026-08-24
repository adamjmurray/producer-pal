// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  deleteConfigMarkdown,
  listConfigMarkdownFiles,
  listConfigMarkdownFilesRecursive,
} from "#src/mcp-server/helpers/config-store/config-markdown-store.ts";
import { warn } from "#src/mcp-server/node-for-max-logger.ts";
import { useTempConfigDir } from "../config-dir-test-helpers.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

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

    expect(() => listConfigMarkdownFiles("memory")).toThrow("ENOTDIR");
  });

  it("ignores a .md-named directory instead of listing it", () => {
    // A directory named like an entry would list as "weird.md" and then throw
    // EISDIR when a later read tried to open it, wedging the whole collection.
    writeInSubdir("memory", "a.md");
    mkdirSync(join(getDir(), "memory", "weird.md"), { recursive: true });

    expect(listConfigMarkdownFiles("memory")).toStrictEqual(["a.md"]);
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

describe("deleteConfigMarkdown", () => {
  it("removes an existing file without warning", () => {
    writeFileSync(join(getDir(), "context.md"), "x");

    deleteConfigMarkdown("context.md");

    expect(existsSync(join(getDir(), "context.md"))).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("silently ignores a missing file (ENOENT)", () => {
    deleteConfigMarkdown("nope.md");

    expect(warn).not.toHaveBeenCalled();
  });

  it("warns and continues when unlink fails for a non-ENOENT reason", () => {
    // Unlinking a directory throws EISDIR (Linux) / EPERM (macOS) — a real
    // non-ENOENT failure with no mocking. The old file surviving on such an
    // error is the rename phantom-duplicate case, so it must warn rather than
    // swallow silently.
    mkdirSync(join(getDir(), "adir.md"), { recursive: true });

    deleteConfigMarkdown("adir.md");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("adir.md"));
  });

  it("is inert under Vitest without a dir override", () => {
    const path = join(getDir(), "context.md");

    writeFileSync(path, "x");
    delete process.env.PRODUCER_PAL_CONFIG_DIR;

    deleteConfigMarkdown("context.md");

    expect(existsSync(path)).toBe(true);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readGlobalContext,
  resolveContextPath,
  writeGlobalContext,
} from "../helpers/global-context-store.ts";

const ORIGINAL_DIR = process.env.PRODUCER_PAL_CONFIG_DIR;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ppal-ctx-"));
  process.env.PRODUCER_PAL_CONFIG_DIR = dir;
});

afterEach(() => {
  if (ORIGINAL_DIR == null) {
    delete process.env.PRODUCER_PAL_CONFIG_DIR;
  } else {
    process.env.PRODUCER_PAL_CONFIG_DIR = ORIGINAL_DIR;
  }

  rmSync(dir, { recursive: true, force: true });
});

describe("resolveContextPath", () => {
  it("uses the PRODUCER_PAL_CONFIG_DIR override when set", () => {
    expect(resolveContextPath()).toBe(join(dir, "context.md"));
  });

  it("defaults to ~/.producer-pal/context.md when no override is set", () => {
    delete process.env.PRODUCER_PAL_CONFIG_DIR;

    expect(
      resolveContextPath().endsWith(join(".producer-pal", "context.md")),
    ).toBe(true);
  });
});

describe("readGlobalContext", () => {
  it("returns trimmed file contents when the file exists", () => {
    writeFileSync(join(dir, "context.md"), "  I make ambient techno.\n\n");

    expect(readGlobalContext()).toBe("I make ambient techno.");
  });

  it("returns an empty string when the file is missing", () => {
    expect(readGlobalContext()).toBe("");
  });

  it("is inert under Vitest without a dir override (never reads real home)", () => {
    delete process.env.PRODUCER_PAL_CONFIG_DIR;

    expect(readGlobalContext()).toBe("");
  });
});

describe("writeGlobalContext", () => {
  it("round-trips through the filesystem, creating the dir if needed", () => {
    const nested = join(dir, "nested");

    process.env.PRODUCER_PAL_CONFIG_DIR = nested;

    writeGlobalContext("I prefer dark, minimal arrangements.");

    expect(readGlobalContext()).toBe("I prefer dark, minimal arrangements.");
  });

  it("leaves no temp file behind (atomic temp+rename)", () => {
    writeGlobalContext("some context");

    const leftovers = readdirSync(dir).filter((name) => name.endsWith(".tmp"));

    expect(leftovers).toStrictEqual([]);
  });

  it("is inert under Vitest without a dir override (never writes real home)", () => {
    delete process.env.PRODUCER_PAL_CONFIG_DIR;

    expect(() => writeGlobalContext("should not be written")).not.toThrow();
    // The override dir stays untouched — nothing leaked to a resolved path.
    expect(existsSync(join(dir, "context.md"))).toBe(false);
  });
});

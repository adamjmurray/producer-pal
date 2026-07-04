// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readGlobalContext } from "#src/mcp-server/helpers/global-context/global-context-store.ts";
import {
  readSystemPrompt,
  writeSystemPrompt,
} from "#src/mcp-server/helpers/system-prompt-store.ts";
import { useTempConfigDir } from "../config-dir-test-helpers.ts";

const getDir = useTempConfigDir();

describe("readSystemPrompt", () => {
  it("returns file contents verbatim when the file exists", () => {
    // Byte-faithful (not trimmed) so the editor's GET/PUT round-trip stays
    // stable, matching the global-context store's contract.
    writeFileSync(
      join(getDir(), "system-prompt.md"),
      "  Always answer in haiku.\n\n",
    );

    expect(readSystemPrompt()).toBe("  Always answer in haiku.\n\n");
  });

  it("returns an empty string when the file is missing", () => {
    expect(readSystemPrompt()).toBe("");
  });
});

describe("writeSystemPrompt", () => {
  it("round-trips through the filesystem", () => {
    writeSystemPrompt("You are a terse studio engineer.");

    expect(readSystemPrompt()).toBe("You are a terse studio engineer.");
  });

  it("writes system-prompt.md without touching the global context file", () => {
    writeSystemPrompt("custom prompt");

    // The two slots are distinct files: writing the prompt must not spill into
    // context.md, and reading the prompt must not pick up global context.
    expect(existsSync(join(getDir(), "system-prompt.md"))).toBe(true);
    expect(readGlobalContext()).toBe("");
  });
});

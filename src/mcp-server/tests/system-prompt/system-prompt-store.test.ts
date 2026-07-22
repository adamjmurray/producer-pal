// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readGlobalContext } from "#src/mcp-server/helpers/global-context/global-context-store.ts";
import {
  readSystemPrompt,
  readSystemPromptState,
  writeSystemPrompt,
} from "#src/mcp-server/helpers/system-prompt-store.ts";
import { VERSION } from "#src/shared/config.ts";
import { useTempConfigDir } from "../config-dir-test-helpers.ts";

const getDir = useTempConfigDir();

/**
 * Absolute path to the system-prompt file inside the temp config dir.
 * @returns Absolute file path
 */
function promptPath(): string {
  return join(getDir(), "system-prompt.md");
}

describe("readSystemPrompt", () => {
  it("returns a hand-authored (frontmatter-free) prompt verbatim", () => {
    // Content-faithful so the editor's GET/PUT round-trip stays stable; a file
    // with no provenance frontmatter is returned exactly as written.
    writeFileSync(promptPath(), "  Always answer in haiku.\n\n");

    expect(readSystemPrompt()).toBe("  Always answer in haiku.\n\n");
  });

  it("returns an empty string when the file is missing", () => {
    expect(readSystemPrompt()).toBe("");
  });

  it("strips provenance frontmatter, returning only the body", () => {
    writeSystemPrompt("You are a terse studio engineer.");

    expect(readSystemPrompt()).toBe("You are a terse studio engineer.");
  });
});

describe("writeSystemPrompt", () => {
  it("stamps fork-time provenance and returns the new state", () => {
    const state = writeSystemPrompt("Speak like a synth manual.");

    expect(state.content).toBe("Speak like a synth manual.");
    expect(state.drifted).toBe(false);
    expect(state.forkedFromVersion).toBe(VERSION);
  });

  it("persists provenance frontmatter above the body on disk", () => {
    writeSystemPrompt("custom prompt");
    const raw = readFileSync(promptPath(), "utf8");

    expect(raw.startsWith("---\n")).toBe(true);
    expect(raw).toContain(`producerPalVersion: ${VERSION}`);
    expect(raw).toContain("builtInHash: ");
    expect(raw.trimEnd().endsWith("custom prompt")).toBe(true);
  });

  it("writes system-prompt.md without touching the global context file", () => {
    writeSystemPrompt("custom prompt");

    // The two slots are distinct files: writing the prompt must not spill into
    // context.md, and reading the prompt must not pick up global context.
    expect(existsSync(promptPath())).toBe(true);
    expect(readGlobalContext()).toBe("");
  });

  it("resets to the built-in (deletes the file) when given blank content", () => {
    writeSystemPrompt("temporary");
    const state = writeSystemPrompt("   \n  ");

    expect(state.content).toBe("");
    expect(state.forkedFromVersion).toBeNull();
    expect(existsSync(promptPath())).toBe(false);
  });
});

describe("readSystemPromptState", () => {
  it("reports no override and no drift when the file is missing", () => {
    expect(readSystemPromptState()).toStrictEqual({
      content: "",
      drifted: false,
      forkedFromVersion: null,
    });
  });

  it("flags drift when the stored hash differs from the current built-in", () => {
    // Simulate a prompt forked from an older, since-changed built-in.
    writeFileSync(
      promptPath(),
      "---\nproducerPalVersion: 0.0.1\nbuiltInHash: stalehash\n---\n\nmy fork",
    );

    const state = readSystemPromptState();

    expect(state.content).toBe("my fork");
    expect(state.drifted).toBe(true);
    expect(state.forkedFromVersion).toBe("0.0.1");
  });

  it("does not flag drift for a prompt forked from the current built-in", () => {
    writeSystemPrompt("fresh fork");

    expect(readSystemPromptState().drifted).toBe(false);
  });

  it("never flags drift for a hand-authored prompt with no provenance", () => {
    writeFileSync(promptPath(), "hand written, no provenance");

    const state = readSystemPromptState();

    expect(state.content).toBe("hand written, no provenance");
    expect(state.drifted).toBe(false);
    expect(state.forkedFromVersion).toBeNull();
  });
});

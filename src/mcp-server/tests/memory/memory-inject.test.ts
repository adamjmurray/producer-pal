// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rememberMemory } from "#src/mcp-server/helpers/memory/memory-store.ts";
import {
  withMemory,
  type MemoryInjectConfig,
} from "#src/mcp-server/helpers/memory/memory-inject.ts";
import {
  connectResponse,
  fakeInnerCall,
  useTempConfigDir,
} from "../config-dir-test-helpers.ts";

const getDir = useTempConfigDir();

/**
 * Write a raw memory file (bypassing the store) to simulate a legacy or
 * hand-authored entry — e.g. one with no description, which the store's write
 * path rejects but the index render still tolerates.
 * @param file - Basename under memory/ (e.g. "r.md")
 * @param contents - Raw file contents
 */
function writeRawMemory(file: string, contents: string): void {
  mkdirSync(join(getDir(), "memory"), { recursive: true });
  writeFileSync(join(getDir(), "memory", file), contents);
}

/**
 * Run withMemory over a ppal-connect call and return the appended block text.
 * @param config - Small-model mode and toolset overrides (both default to off)
 * @returns The appended memory block, or undefined when none was appended
 */
async function appendedBlock(
  config: Partial<MemoryInjectConfig> = {},
): Promise<string | undefined> {
  const result = await withMemory(fakeInnerCall(connectResponse()), () => ({
    smallModelMode: false,
    ...config,
  }))("ppal-connect", {});

  return result.content.length > 1 ? result.content[1]?.text : undefined;
}

describe("withMemory", () => {
  it("injects every memory as an index line, never a body", async () => {
    rememberMemory({
      name: "prefers-c-minor",
      description: "default key",
      body: "Composes mostly in C minor.",
    });
    rememberMemory({
      name: "loose-drums",
      description: "swing/humanize",
      body: "Never hard-quantize hats.",
    });
    rememberMemory({
      name: "album-nyx",
      description: "dark ambient, 60bpm",
      body: "The Nyx album body.",
    });

    const block = (await appendedBlock()) ?? "";

    // Flat, alphabetical-by-name index lines, one recall hook per entry.
    expect(block).toContain("- `album-nyx` — dark ambient, 60bpm");
    expect(block).toContain("- `loose-drums` — swing/humanize");
    expect(block).toContain("- `prefers-c-minor` — default key");
    // Bodies are NEVER injected — only the index.
    expect(block).not.toContain("Composes mostly in C minor.");
    expect(block).not.toContain("Never hard-quantize hats.");
    expect(block).not.toContain("The Nyx album body.");
    // Tells the assistant how to load a body on demand.
    expect(block).toContain('action:"read"');
  });

  it("renders a descriptionless entry without a trailing dash", async () => {
    // Empty-description writes are rejected, but a legacy/hand-authored file
    // with no description must still inject its index line (no dash).
    writeRawMemory("r.md", "SECRET_BODY");

    const block = (await appendedBlock()) ?? "";

    expect(block).toContain("- `r`");
    expect(block).not.toContain("- `r` —");
    expect(block).not.toContain("SECRET_BODY");
  });

  it("does not inject when there are no memories", async () => {
    expect(await appendedBlock()).toBeUndefined();
  });

  it("leaves non-connect tool responses untouched", async () => {
    rememberMemory({ name: "u", description: "d", body: "b" });

    const result = await withMemory(fakeInnerCall(connectResponse()), () => ({
      smallModelMode: false,
    }))("ppal-read-track", {});

    expect(result.content).toHaveLength(1);
  });

  it("injects the index when small-model mode is off", async () => {
    rememberMemory({ name: "prefers-c-minor", description: "d", body: "b" });

    const block = await appendedBlock({ smallModelMode: false });

    expect(block).toContain("prefers-c-minor");
  });

  it("skips the index when small-model mode is active", async () => {
    rememberMemory({ name: "prefers-c-minor", description: "d", body: "b" });

    expect(await appendedBlock({ smallModelMode: true })).toBeUndefined();
  });

  it("injects the index when the toolset keeps ppal-context", async () => {
    rememberMemory({ name: "prefers-c-minor", description: "d", body: "b" });

    const block = await appendedBlock({
      tools: ["ppal-connect", "ppal-context"],
    });

    expect(block).toContain("prefers-c-minor");
  });

  it("skips the index when the toolset has no ppal-context", async () => {
    // Context unchecked in the Tools tab, or a subagent worker: the index would
    // name a tool the caller cannot call.
    rememberMemory({ name: "prefers-c-minor", description: "d", body: "b" });

    expect(
      await appendedBlock({ tools: ["ppal-connect", "ppal-read-track"] }),
    ).toBeUndefined();
  });

  it("injects the index when the toolset is unknown", async () => {
    rememberMemory({ name: "prefers-c-minor", description: "d", body: "b" });

    const block = await appendedBlock({ tools: undefined });

    expect(block).toContain("prefers-c-minor");
  });
});

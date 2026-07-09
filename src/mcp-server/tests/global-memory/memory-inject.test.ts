// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { rememberMemory } from "#src/mcp-server/helpers/memory/global-memory-store.ts";
import { withMemory } from "#src/mcp-server/helpers/memory/memory-inject.ts";
import {
  connectResponse,
  fakeInnerCall,
  useTempConfigDir,
} from "../config-dir-test-helpers.ts";

useTempConfigDir();

/**
 * Run withMemory over a ppal-connect call and return the appended block text.
 * @param smallModelMode - Whether small-model mode is active
 * @returns The appended memory block, or undefined when none was appended
 */
async function appendedBlock(
  smallModelMode = false,
): Promise<string | undefined> {
  const result = await withMemory(
    fakeInnerCall(connectResponse()),
    () => smallModelMode,
  )("ppal-connect", {});

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
    rememberMemory({
      name: "r",
      description: "",
      body: "SECRET_BODY",
    });

    const block = (await appendedBlock()) ?? "";

    expect(block).toContain("- `r`");
    expect(block).not.toContain("- `r` —");
    expect(block).not.toContain("SECRET_BODY");
  });

  it("does not inject when there are no memories", async () => {
    const result = await withMemory(
      fakeInnerCall(connectResponse()),
      () => false,
    )("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });

  it("leaves non-connect tool responses untouched", async () => {
    rememberMemory({ name: "u", description: "d", body: "b" });

    const result = await withMemory(
      fakeInnerCall(connectResponse()),
      () => false,
    )("ppal-read-track", {});

    expect(result.content).toHaveLength(1);
  });

  it("injects the index when small-model mode is off", async () => {
    rememberMemory({ name: "prefers-c-minor", description: "d", body: "b" });

    const block = await appendedBlock(false);

    expect(block).toContain("prefers-c-minor");
  });

  it("skips the index when small-model mode is active", async () => {
    rememberMemory({ name: "prefers-c-minor", description: "d", body: "b" });

    const result = await withMemory(
      fakeInnerCall(connectResponse()),
      () => true,
    )("ppal-connect", {});

    expect(result.content).toHaveLength(1);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { rememberMemory } from "#src/mcp-server/helpers/memory/memory-store.ts";
import {
  connectResponse,
  fakeInnerCall,
  useTempConfigDir,
} from "#src/mcp-server/tests/config-dir-test-helpers.ts";
import { DEFAULT_NOTATION } from "#src/shared/notation.ts";
import {
  enrichConnect,
  type ConnectEnrichmentConfig,
} from "../enrich-connect.ts";

const getDir = useTempConfigDir();

/**
 * Run the full enrichment chain over a ppal-connect call.
 * @param overrides - Device settings to override the defaults
 * @returns The text of every content block, in order
 */
async function enrichedBlocks(
  overrides: Partial<ConnectEnrichmentConfig> = {},
): Promise<string[]> {
  const config: ConnectEnrichmentConfig = {
    notation: DEFAULT_NOTATION,
    smallModelMode: false,
    projectContext: "",
    ...overrides,
  };

  const result = await enrichConnect(
    fakeInnerCall(connectResponse()),
    () => config,
  )("ppal-connect", {});

  return result.content.map((block) => block.text);
}

describe("enrichConnect", () => {
  it("appends every block in order: skills, project, global, memory, next step", async () => {
    writeFileSync(join(getDir(), "context.md"), "I make ambient techno.");
    rememberMemory({
      name: "hates-quantized-hats",
      description: "Dislikes rigidly quantized hi-hats",
      body: "Apply swing to hi-hats by default.",
    });

    const blocks = await enrichedBlocks({ projectContext: "House track." });

    expect(blocks).toHaveLength(6); // the connect result itself, then five
    expect(blocks[1]).toContain("Producer Pal"); // skills
    expect(blocks[2]).toContain("Project context (this Live Set):");
    expect(blocks[3]).toContain("Global context (all projects):");
    expect(blocks[4]).toContain("Memory index");
    expect(blocks[5]).toContain("Report the connection status");
  });

  // The next step reacts to the context and memory carried by the blocks before
  // it, and reads as the response's final word. Compose it anywhere but
  // outermost and it lands mid-response, ahead of the very blocks it describes —
  // which is exactly the bug that moving it out of V8's connect() result fixed.
  it("puts the next step LAST even when every other block is absent", async () => {
    const blocks = await enrichedBlocks();

    expect(blocks.at(-1)).toContain("Report the connection status");
  });

  it("offers to get to know a user with no global context and no memories", async () => {
    const blocks = await enrichedBlocks();

    expect(blocks.at(-1)).toContain("musical style, preferences, and goals");
  });

  // The project blob reaches the next step by a different route than the other
  // two layers — it's a device config value, not a file — so only the composed
  // chain proves it arrives at all. Get this wiring wrong and the report claims
  // project context is empty when the user has written pages of it.
  it("reports the empty layers, project context included", async () => {
    const blocks = await enrichedBlocks();

    expect(blocks.at(-1)).toContain(
      "Currently empty: project context, global context, memory.",
    );
  });

  it("leaves a filled project blob out of the empty-layer report", async () => {
    const blocks = await enrichedBlocks({ projectContext: "House track." });

    expect(blocks.at(-1)).toContain("Currently empty: global context, memory.");
  });

  it("drops the offer once a memory exists, and keeps the next step last", async () => {
    rememberMemory({
      name: "prefers-dark-techno",
      description: "Default genre for new material",
      body: "Dark, hypnotic techno around 138 BPM.",
    });

    const blocks = await enrichedBlocks();

    expect(blocks.at(-1)).not.toContain(
      "musical style, preferences, and goals",
    );
    expect(blocks.at(-1)).toContain("Report the connection status");
  });
});

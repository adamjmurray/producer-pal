// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E test for `ppal-duplicate` refusing a position sent twice, one of them
 * through the deprecated `locator`. The refusal names the params the caller
 * sent, not the arrangementStart the locator folds onto.
 * Uses: e2e-test-set (t8 is an empty MIDI track; the Set has a Verse locator)
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-locator-refusals
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

describe("ppal-duplicate position sent twice with a locator", () => {
  it("names toPath when a scene's position comes with a locator", async () => {
    const scenes = parseToolResult<{ scenes: Array<{ id: string }> }>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["scenes"] },
      }),
    );

    const refused = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "scene",
        id: scenes.scenes[0]!.id,
        toPath: "[5|1]",
        locator: "Verse",
      },
    });

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain(
      "toPath names the position on its own - don't send locator with it",
    );
  });

  it("names locator when a clip's position comes with toPath", async () => {
    const clip = parseToolResult<{ id: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: { path: `t${EMPTY_MIDI_TRACK}/s0`, notes: "C3 1|1" },
      }),
    );

    await sleep(100);

    const refused = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: clip.id,
        toPath: `t${EMPTY_MIDI_TRACK}[5|1]`,
        locator: "Verse",
      },
    });

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain(
      "toPath names the song position on its own - don't send locator with it",
    );
  });
});

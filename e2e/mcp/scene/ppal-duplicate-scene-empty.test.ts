// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-duplicate copying a scene with no clips to the arrangement.
 * Uses: e2e-test-set (any scene works; the empty one is made by the test)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/scene/ppal-duplicate-scene-empty.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";

const ctx = setupMcpTestContext();

describe("ppal-duplicate of a scene with no clips", () => {
  // Nothing to put on the arrangement is done, not failed: a lone copy answers
  // instead of throwing.
  it("answers an arrangement copy with a detail, not an error", async () => {
    const emptyScene = parseToolResult<{ id: string }>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "scene", path: "s0", withoutClips: true },
      }),
    );

    await sleep(100);

    try {
      const dupResult = await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "scene", id: emptyScene.id, toPath: "[61|1]" },
      });

      expect(isToolError(dupResult)).toBe(false);
      expect(parseToolResult<unknown>(dupResult)).toStrictEqual({
        clips: [],
        detail: "the scene has no clips",
      });
    } finally {
      // Take the scene back out, so later tests see the scenes where they were.
      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { type: "scene", id: emptyScene.id },
      });
      await sleep(100);
    }
  });
});

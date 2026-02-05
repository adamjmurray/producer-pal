// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-read-scene tool
 * Uses: e2e-test-set (8 scenes with various tempo/time sig overrides)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

describe("ppal-read-scene", () => {
  it("reads scenes by various methods with different include params", async () => {
    // Get a scene ID from read-live-set first
    const liveSetResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["scenes"] },
    });
    const liveSet = parseToolResult<LiveSetResult>(liveSetResult);
    const firstScene = liveSet.scenes![0]!;
    const sceneId = firstScene.id;

    // Test 1: Read scene by sceneId
    const byIdResult = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId },
    });
    const byId = parseToolResult<ReadSceneResult>(byIdResult);

    expect(byId.id).toBe(sceneId);
    expect(byId.name).toBeDefined();
    expect(byId.sceneIndex).toBe(firstScene.sceneIndex);

    // Test 2: Read scene by sceneIndex
    const byIndexResult = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneIndex: 0 },
    });
    const byIndex = parseToolResult<ReadSceneResult>(byIndexResult);

    expect(byIndex.id).toBe(sceneId);
    expect(byIndex.sceneIndex).toBe(0);

    // Test 3: Default includes - clipCount should be present
    expect(typeof byId.clipCount).toBe("number");

    // Test 4: Read with include: ["clips"]
    const clipsResult = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId, include: ["clips"] },
    });
    const withClips = parseToolResult<ReadSceneResult>(clipsResult);

    expect(Array.isArray(withClips.clips)).toBe(true);

    // Test 5: Read with include: ["color"]
    const colorResult = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId, include: ["color"] },
    });
    const withColor = parseToolResult<ReadSceneResult>(colorResult);

    expect(withColor.color).toBeDefined();
    expect(withColor.color).toMatch(/^#[0-9A-Fa-f]{6}$/);

    // Test 6: Read with include: ["*"] (all data)
    const allResult = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId, include: ["*"] },
    });
    const all = parseToolResult<ReadSceneResult>(allResult);

    expect(all.color).toBeDefined();
    expect(Array.isArray(all.clips)).toBe(true);

    // Test 7: Non-existent scene throws error
    const nonExistentResult = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneIndex: 999 },
    });

    expect(isToolError(nonExistentResult)).toBe(true);
    expect(getToolErrorMessage(nonExistentResult)).toContain(
      "sceneIndex 999 does not exist",
    );
  });
});

interface LiveSetResult {
  scenes?: Array<{
    id: string;
    name: string;
    sceneIndex: number;
  }>;
}

interface ReadSceneResult {
  id: string | null;
  name: string | null;
  sceneIndex?: number | null;
  color?: string;
  tempo?: number;
  timeSignature?: string;
  clips?: object[];
  clipCount?: number;
}

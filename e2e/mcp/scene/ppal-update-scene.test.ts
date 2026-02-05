// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * E2E tests for ppal-update-scene tool
 * Updates scene properties - these modifications persist within the session.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-scene", () => {
  it("updates scene properties and verifies changes", async () => {
    // First create some scenes to update (don't rely on existing scenes)
    const createResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { sceneIndex: 0, count: 2, name: "UpdateTest" },
    });
    const created = parseToolResult<CreateSceneResult[]>(createResult);
    const sceneId = created[0]!.id;
    const secondSceneId = created[1]!.id;

    await sleep(100);

    // Test 1: Update scene name
    await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { ids: sceneId, name: "Renamed Scene" },
    });

    await sleep(100);
    const afterName = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId },
    });
    const namedScene = parseToolResult<ReadSceneResult>(afterName);

    expect(namedScene.name).toContain("Renamed Scene");

    // Test 2: Update scene color
    await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { ids: sceneId, color: "#00FF00" },
    });

    await sleep(100);
    const afterColor = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId, include: ["color"] },
    });
    const coloredScene = parseToolResult<ReadSceneResult>(afterColor);

    // Color may be quantized to Live's palette
    expect(coloredScene.color).toBeDefined();

    // Test 3: Update scene tempo
    await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { ids: sceneId, tempo: 140 },
    });

    await sleep(100);
    const afterTempo = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId },
    });
    const tempoScene = parseToolResult<ReadSceneResult>(afterTempo);

    expect(tempoScene.tempo).toBe(140);

    // Test 4: Update scene time signature
    await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { ids: sceneId, timeSignature: "6/8" },
    });

    await sleep(100);
    const afterTimeSig = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId },
    });
    const timeSigScene = parseToolResult<ReadSceneResult>(afterTimeSig);

    expect(timeSigScene.timeSignature).toBe("6/8");

    // Test 5: Disable tempo with -1
    await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { ids: sceneId, tempo: -1 },
    });

    await sleep(100);
    const afterDisableTempo = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId },
    });
    const disabledTempoScene =
      parseToolResult<ReadSceneResult>(afterDisableTempo);

    // Tempo should not be in result when disabled
    expect(disabledTempoScene.tempo).toBeUndefined();

    // Test 6: Disable time signature with "disabled"
    await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { ids: sceneId, timeSignature: "disabled" },
    });

    await sleep(100);
    const afterDisableTimeSig = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId },
    });
    const disabledTimeSigScene =
      parseToolResult<ReadSceneResult>(afterDisableTimeSig);

    // Time signature should not be in result when disabled
    expect(disabledTimeSigScene.timeSignature).toBeUndefined();

    // Test 7: Batch update multiple scenes
    const batchResult = await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { ids: `${sceneId}, ${secondSceneId}`, name: "BatchUpdated" },
    });
    const batch = parseToolResult<UpdateSceneResult[]>(batchResult);

    expect(Array.isArray(batch)).toBe(true);
    expect(batch).toHaveLength(2);

    await sleep(100);
    const verifyFirst = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId },
    });
    const verifySecond = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId: secondSceneId },
    });
    const firstScene = parseToolResult<ReadSceneResult>(verifyFirst);
    const secondScene = parseToolResult<ReadSceneResult>(verifySecond);

    expect(firstScene.name).toContain("BatchUpdated");
    expect(secondScene.name).toContain("BatchUpdated");
  });
});

interface CreateSceneResult {
  id: string;
  sceneIndex: number;
}

interface UpdateSceneResult {
  id: string;
}

interface ReadSceneResult {
  id: string | null;
  name: string | null;
  color?: string;
  tempo?: number;
  timeSignature?: string;
}

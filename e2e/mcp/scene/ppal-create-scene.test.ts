// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-create-scene tool
 * Creates scenes in the Live Set - these modifications persist within the session.
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

describe("ppal-create-scene", () => {
  it("creates scenes with properties", async () => {
    // Test 1: Create single scene at index 0
    const basicResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { sceneIndex: 0 },
    });
    const basic = parseToolResult<CreateSceneResult>(basicResult);

    expect(basic.id).toBeDefined();
    expect(basic.sceneIndex).toBe(0);

    // Test 2: Create scene with name
    const namedResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { sceneIndex: 1, name: "Test Scene" },
    });
    const named = parseToolResult<CreateSceneResult>(namedResult);

    await sleep(100);
    const verifyNamed = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId: named.id },
    });
    const namedScene = parseToolResult<ReadSceneResult>(verifyNamed);

    expect(namedScene.name).toContain("Test Scene");

    // Test 3: Create scene with color
    const coloredResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { sceneIndex: 2, name: "Colored Scene", color: "#FF0000" },
    });
    const colored = parseToolResult<CreateSceneResult>(coloredResult);

    await sleep(100);
    const verifyColored = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId: colored.id, include: ["color"] },
    });
    const coloredScene = parseToolResult<ReadSceneResult>(verifyColored);

    // Color may be quantized to Live's palette, but should be set
    expect(coloredScene.color).toBeDefined();

    // Test 4: Create scene with tempo
    const tempoResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { sceneIndex: 3, name: "Tempo Scene", tempo: 120 },
    });
    const tempo = parseToolResult<CreateSceneResult>(tempoResult);

    await sleep(100);
    const verifyTempo = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId: tempo.id },
    });
    const tempoScene = parseToolResult<ReadSceneResult>(verifyTempo);

    expect(tempoScene.tempo).toBe(120);

    // Test 5: Create scene with timeSignature
    const timeSigResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { sceneIndex: 4, name: "TimeSig Scene", timeSignature: "3/4" },
    });
    const timeSig = parseToolResult<CreateSceneResult>(timeSigResult);

    await sleep(100);
    const verifyTimeSig = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId: timeSig.id },
    });
    const timeSigScene = parseToolResult<ReadSceneResult>(verifyTimeSig);

    expect(timeSigScene.timeSignature).toBe("3/4");
  });

  it("creates multiple scenes in batch", async () => {
    // Get initial scene count
    const initialResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const initial = parseToolResult<LiveSetResult>(initialResult);
    const initialSceneCount = initial.sceneCount ?? 0;

    // Test 1: Create multiple scenes with count
    const batchResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { sceneIndex: 5, count: 2 },
    });
    const batch = parseToolResult<CreateSceneResult[]>(batchResult);

    expect(Array.isArray(batch)).toBe(true);
    expect(batch).toHaveLength(2);
    expect(batch[0]!.id).toBeDefined();
    expect(batch[1]!.id).toBeDefined();
    expect(batch[0]!.sceneIndex).toBe(5);
    expect(batch[1]!.sceneIndex).toBe(6);

    // Test 2: Create multiple scenes with name
    const multiNameResult = await ctx.client!.callTool({
      name: "ppal-create-scene",
      arguments: { sceneIndex: 7, count: 2, name: "Multi" },
    });
    const multiName = parseToolResult<CreateSceneResult[]>(multiNameResult);

    expect(multiName).toHaveLength(2);

    await sleep(100);
    const verifyFirst = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId: multiName[0]!.id },
    });
    const verifySecond = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { sceneId: multiName[1]!.id },
    });
    const firstScene = parseToolResult<ReadSceneResult>(verifyFirst);
    const secondScene = parseToolResult<ReadSceneResult>(verifySecond);

    expect(firstScene.name).toContain("Multi");
    expect(secondScene.name).toContain("Multi");

    // Verify scene count increased
    const finalResult = await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: {},
    });
    const final = parseToolResult<LiveSetResult>(finalResult);
    const finalSceneCount = final.sceneCount ?? 0;

    // Created: 2 batch + 2 multiName = 4
    expect(finalSceneCount).toBeGreaterThan(initialSceneCount);
  });
});

interface LiveSetResult {
  sceneCount?: number;
}

interface CreateSceneResult {
  id: string;
  sceneIndex: number;
}

interface ReadSceneResult {
  id: string | null;
  name: string | null;
  color?: string;
  tempo?: number;
  timeSignature?: string;
}

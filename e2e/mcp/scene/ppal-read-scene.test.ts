// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-read-scene tool
 * Uses: e2e-test-set (8 scenes with various tempo/time sig overrides)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- scene/ppal-read-scene
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  parseAliasedToolResult,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

describe("ppal-read-scene", () => {
  /**
   * The Set's first scene, as read-live-set reports it.
   * @returns The scene summary
   */
  async function firstScene(): Promise<{
    id: string;
    name: string;
    path: string;
  }> {
    const liveSet = parseToolResult<LiveSetResult>(
      await ctx.client!.callTool({
        name: "ppal-read-live-set",
        arguments: { include: ["scenes"] },
      }),
    );

    return liveSet.scenes![0]!;
  }

  /**
   * Read a scene.
   * @param args - ppal-read-scene arguments
   * @returns The parsed scene
   */
  async function readScene(
    args: Record<string, unknown>,
  ): Promise<ReadSceneResult> {
    return parseToolResult<ReadSceneResult>(
      await ctx.client!.callTool({ name: "ppal-read-scene", arguments: args }),
    );
  }

  it("reads a scene by id, spelled the way a model guesses it", async () => {
    // "sceneId" is a permanent alias, so this checks the read and the steer.
    const scene = await firstScene();
    const byId = parseAliasedToolResult<ReadSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-read-scene",
        arguments: { sceneId: scene.id },
      }),
      "ppal-read-scene",
      "sceneId",
      "id",
    );

    expect(byId.id).toBe(scene.id);
    expect(byId.name).toBeDefined();
    expect(byId.path).toBe(scene.path);
    // clipCount comes back without asking for any include
    expect(typeof byId.clipCount).toBe("number");
  });

  it("reads a scene by index", async () => {
    const scene = await firstScene();
    const byIndex = await readScene({ path: "s0" });

    expect(byIndex.id).toBe(scene.id);
    expect(byIndex.path).toBe("s0");
  });

  it("names the track each clip sits on with include clips", async () => {
    const scene = await firstScene();
    const withClips = await readScene({ id: scene.id, include: ["clips"] });

    // The path ("t0/s0") says which track by index but not which one it is, so
    // without the name a caller asking what a scene holds can't tell the drums
    // from the bass.
    expect(withClips.clips).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "t0/s0", trackName: "Drums" }),
        expect.objectContaining({ path: "t1/s0", trackName: "Bass" }),
      ]),
    );
  });

  it("adds the color only when asked", async () => {
    const scene = await firstScene();
    const withColor = await readScene({ id: scene.id, include: ["color"] });

    expect(withColor.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('includes everything with "*"', async () => {
    const scene = await firstScene();
    const all = await readScene({ id: scene.id, include: ["*"] });

    expect(all.color).toBeDefined();
    expect(Array.isArray(all.clips)).toBe(true);
  });

  it("errors on a scene path that isn't there", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { path: "s999" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      'readScene: nothing at path "s999"',
    );
  });
});

interface LiveSetResult {
  scenes?: Array<{
    id: string;
    name: string;
    path: string;
  }>;
}

interface ReadSceneResult {
  id: string | null;
  name: string | null;
  path?: string;
  color?: string;
  tempo?: number;
  timeSignature?: string;
  clips?: Array<{ path?: string; trackName?: string }>;
  clipCount?: number;
}

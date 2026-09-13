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
  parseBatchResult,
  parseToolResult,
  type SkippedTargetResult,
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

  it("names warp as an include, and only then reports it", async () => {
    // t4/s0 is a warped audio clip. `warp` reached the nested clip read through
    // `*` before read-scene published it, so `*` must keep the data now that
    // the option list expands here instead of downstream.
    const scene = await firstScene();
    const warpOf = async (include: string[]) =>
      (await readScene({ id: scene.id, include })).clips?.find(
        (clip) => clip.path === "t4/s0",
      );

    const named = await warpOf(["clips", "warp"]);

    expect(named?.warping).toBe(true);
    expect(named?.warpMode).toBeDefined();

    expect((await warpOf(["*"]))?.warping).toBe(true);
    expect((await warpOf(["clips"]))?.warping).toBeUndefined();
  });

  it("errors on a scene path that isn't there", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: { path: "s999" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain('nothing at path "s999"');
  });

  // isError already flags the failure, and the response is paired with the call
  // that made it, so the message names the reason and not the tool.
  it("reports the failure reason without naming the tool", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-read-scene",
      arguments: {},
    });

    expect(isToolError(result)).toBe(true);
    const message = getToolErrorMessage(result);

    expect(message).not.toContain("executing tool");
    expect(message).toBe("Error: id or path is required");
  });
});

describe("ppal-read-scene over a list of targets", () => {
  const readScenes = (args: Record<string, unknown>) =>
    ctx.client!.callTool({ name: "ppal-read-scene", arguments: args });

  it("returns one entry per path, in the order named", async () => {
    const scenes = parseBatchResult<ReadSceneResult>(
      await readScenes({ path: "s2,s0,s1" }),
      3,
    );

    expect(scenes.map((scene) => scene.path)).toStrictEqual(["s2", "s0", "s1"]);
    expect(scenes.map((scene) => scene.name)).toStrictEqual([
      "Chorus",
      "Intro",
      "Verse 1",
    ]);
  });

  it("reads ids and paths together, ids first", async () => {
    const intro = parseToolResult<ReadSceneResult>(
      await readScenes({ path: "s0" }),
    );
    const scenes = parseBatchResult<ReadSceneResult>(
      await readScenes({ id: intro.id!, path: "s1" }),
      2,
    );

    expect(scenes[0]!.id).toBe(intro.id);
    expect(scenes[1]!.path).toBe("s1");
    expect(scenes.map((scene) => scene.name)).toStrictEqual([
      "Intro",
      "Verse 1",
    ]);
  });

  it("keeps a slot for a scene past the end and reads the rest", async () => {
    const entries = parseBatchResult<ReadSceneResult | SkippedTargetResult>(
      await readScenes({ path: "s0,s999,s1" }),
      3,
    );

    expect(entries).toStrictEqual([
      expect.objectContaining({ path: "s0", name: "Intro" }),
      { path: "s999", ok: false, reason: 'nothing at path "s999"' },
      expect.objectContaining({ path: "s1", name: "Verse 1" }),
    ]);
  });

  it("unwraps a single target", async () => {
    const scene = parseToolResult<ReadSceneResult>(
      await readScenes({ path: "s0" }),
    );

    expect(Array.isArray(scene)).toBe(false);
    expect(scene.path).toBe("s0");
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
  clips?: Array<{
    path?: string;
    trackName?: string;
    warping?: boolean;
    warpMode?: string;
  }>;
  clipCount?: number;
}

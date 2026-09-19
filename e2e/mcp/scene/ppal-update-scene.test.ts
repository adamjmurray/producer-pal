// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-scene tool
 * Updates scene properties - these modifications persist within the session.
 *
 * Uses: e2e-test-set
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- scene/ppal-update-scene
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseBatchResult,
  parseToolResult,
  setupMcpTestContext,
  type SkippedTargetResult,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-scene", () => {
  /**
   * Two fresh scenes to work on, so the Set's own scenes stay intact.
   * @returns The new scenes' ids
   */
  async function createScenes(): Promise<string[]> {
    const created = parseToolResult<CreateSceneResult[]>(
      await ctx.client!.callTool({
        name: "ppal-create-scene",
        // One path entry per scene: `count` is deprecated and warns.
        arguments: { path: "s0,s0", name: "UpdateTest" },
      }),
    );

    await sleep(100);

    return created.map((scene) => scene.id);
  }

  /**
   * Apply a scene update and read the scene back.
   * @param id - Scene to update
   * @param args - ppal-update-scene arguments beyond the id
   * @param include - Optional include list for the read-back
   * @returns The scene after the update
   */
  async function updateAndRead(
    id: string,
    args: Record<string, unknown>,
    include?: string[],
  ): Promise<ReadSceneResult> {
    await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { id, ...args },
    });
    await sleep(100);

    return parseToolResult<ReadSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-read-scene",
        arguments: { id, ...(include && { include }) },
      }),
    );
  }

  it("renames a scene", async () => {
    const [sceneId] = await createScenes();
    const scene = await updateAndRead(sceneId!, { name: "Renamed Scene" });

    expect(scene.name).toBe("Renamed Scene");
  });

  it("recolors a scene", async () => {
    const [sceneId] = await createScenes();
    const scene = await updateAndRead(sceneId!, { color: "#00FF00" }, [
      "color",
    ]);

    // Live snaps to its own palette, so only that a color came back is pinned
    expect(scene.color).toBeDefined();
  });

  it("sets and disables the tempo override", async () => {
    const [sceneId] = await createScenes();

    expect((await updateAndRead(sceneId!, { tempo: 140 })).tempo).toBe(140);
    // A disabled override is left out of the result rather than reported as -1
    expect(
      (await updateAndRead(sceneId!, { tempo: -1 })).tempo,
    ).toBeUndefined();
  });

  it("sets and disables the time signature override", async () => {
    const [sceneId] = await createScenes();

    expect(
      (await updateAndRead(sceneId!, { timeSignature: "6/8" })).timeSignature,
    ).toBe("6/8");
    expect(
      (await updateAndRead(sceneId!, { timeSignature: "disabled" }))
        .timeSignature,
    ).toBeUndefined();
  });

  it("updates several scenes in one call", async () => {
    const [sceneId, secondSceneId] = await createScenes();
    const result = await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { id: `${sceneId}, ${secondSceneId}`, name: "BatchUpdated" },
    });

    parseBatchResult<UpdateSceneResult>(result, 2);

    await sleep(100);

    for (const id of [sceneId!, secondSceneId!]) {
      const scene = parseToolResult<ReadSceneResult>(
        await ctx.client!.callTool({
          name: "ppal-read-scene",
          arguments: { id },
        }),
      );

      expect(scene.name).toBe("BatchUpdated");
    }
  });
});

describe("ppal-update-scene over a list with a target it can't reach", () => {
  /**
   * Call ppal-update-scene.
   * @param args - The tool's arguments
   * @returns The raw tool result
   */
  function updateScene(args: Record<string, unknown>): Promise<unknown> {
    return ctx.client!.callTool({ name: "ppal-update-scene", arguments: args });
  }

  it("keeps a slot for a path that names no scene, and warns nowhere", async () => {
    // parseBatchResult fails the test if anything warned: the entry carries it.
    const entries = parseBatchResult<UpdateSceneResult | SkippedTargetResult>(
      await updateScene({ path: "s0,s999", name: "ListSkip,Nowhere" }),
      2,
    );

    expect(entries).toStrictEqual([
      expect.objectContaining({ path: "s0" }),
      { path: "s999", ok: false, reason: 'no scene at path "s999"' },
    ]);

    const scene = parseToolResult<ReadSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-read-scene",
        arguments: { path: "s0" },
      }),
    );

    expect(scene.name).toBe("ListSkip");
  });

  it("throws when the one target it was given names no scene", async () => {
    const result = await updateScene({ path: "s999", name: "Nowhere" });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain('no scene at path "s999"');
  });
});

interface CreateSceneResult {
  id: string;
  path: string;
}

interface UpdateSceneResult {
  id: string;
  path?: string;
}

interface ReadSceneResult {
  id: string | null;
  name: string | null;
  color?: string;
  tempo?: number;
  timeSignature?: string;
}

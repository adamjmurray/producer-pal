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
  parseBatchResult,
  parseToolResult,
  setupMcpTestContext,
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
        arguments: { path: "s0", count: 2, name: "UpdateTest" },
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

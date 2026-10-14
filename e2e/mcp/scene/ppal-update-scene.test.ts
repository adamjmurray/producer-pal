// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

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
import { expectPaletteColorReported } from "./scene-color-test-helpers.ts";

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
    // A call that asks nothing is refused, so an empty update is only a read.
    if (Object.keys(args).length > 0) {
      await ctx.client!.callTool({
        name: "ppal-update-scene",
        arguments: { id, ...args },
      });
      await sleep(100);
    }

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

  /**
   * Write a color to a scene.
   * @param id - The scene to recolor
   * @param color - The color to ask for
   * @returns What the call reported
   */
  async function updateSceneColor(
    id: string,
    color: string,
  ): Promise<UpdateSceneResult> {
    return parseToolResult<UpdateSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-update-scene",
        arguments: { id, color },
      }),
    );
  }

  it("reports the palette color Live snapped to, and says nothing when it didn't", async () => {
    const [sceneId, secondSceneId] = await createScenes();

    await expectPaletteColorReported(
      (color) => updateSceneColor(sceneId!, color),
      (color) => updateSceneColor(secondSceneId!, color),
    );
  });

  it("sets and disables the tempo override", async () => {
    const [sceneId] = await createScenes();

    expect((await updateAndRead(sceneId!, { tempo: 140 })).tempo).toBe(140);
    // A disabled override is left out of the result rather than reported as -1
    expect(
      (await updateAndRead(sceneId!, { tempo: -1 })).tempo,
    ).toBeUndefined();
  });

  it("refuses a blank tempo and leaves the override alone", async () => {
    const [sceneId] = await createScenes();

    expect((await updateAndRead(sceneId!, { tempo: 140 })).tempo).toBe(140);

    const result = await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { id: sceneId, tempo: "" },
    });

    expect(getToolErrorMessage(result)).toContain(
      "tempo: a blank string is not a value for this param. Leave it out instead.",
    );
    expect((await updateAndRead(sceneId!, {})).tempo).toBe(140);
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

  it("refuses a denominator Live would change, writing nothing", async () => {
    const [sceneId] = await createScenes();
    const result = await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: { id: sceneId, timeSignature: "4/3" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      'timeSignature "4/3" has a denominator Live can\'t keep',
    );
  });

  it("reports the time signature Live kept when it clamps the numerator", async () => {
    const [sceneId] = await createScenes();
    const result = parseToolResult<UpdateSceneResult & { detail?: string }>(
      await ctx.client!.callTool({
        name: "ppal-update-scene",
        arguments: { id: sceneId, timeSignature: "100/32" },
      }),
    );

    // Live clamped it: the entry carries the kept value, not the one sent.
    expect(result).toStrictEqual(
      expect.objectContaining({
        id: sceneId,
        timeSignature: expect.not.stringMatching(/^100\//),
        detail: "timeSignature read back as shown, not as sent",
      }),
    );
  });

  it("pairs one time signature per scene in one call", async () => {
    const [sceneId, secondSceneId] = await createScenes();
    const result = await ctx.client!.callTool({
      name: "ppal-update-scene",
      arguments: {
        id: `${sceneId},${secondSceneId}`,
        timeSignature: "6/8,7/4",
      },
    });

    parseBatchResult<UpdateSceneResult>(result, 2);

    await sleep(100);

    const meters = [];

    for (const id of [sceneId!, secondSceneId!]) {
      const scene = parseToolResult<ReadSceneResult>(
        await ctx.client!.callTool({
          name: "ppal-read-scene",
          arguments: { id },
        }),
      );

      meters.push(scene.timeSignature);
    }

    expect(meters).toStrictEqual(["6/8", "7/4"]);
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
      {
        path: "s999",
        ok: false,
        detail: 'no scene at path "s999"; ppal-create-scene makes one',
      },
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
    expect(getToolErrorMessage(result)).toContain(
      'no scene at path "s999"; ppal-create-scene makes one',
    );
  });
});

describe("ppal-update-scene over scenes named twice and calls it refuses", () => {
  /**
   * Call ppal-update-scene.
   * @param args - The tool's arguments
   * @returns The raw tool result
   */
  function updateScene(args: Record<string, unknown>): Promise<unknown> {
    return ctx.client!.callTool({ name: "ppal-update-scene", arguments: args });
  }

  /**
   * A fresh scene, so the Set's own scenes stay intact.
   * @returns The new scene's id and path
   */
  async function createScene(): Promise<CreateSceneResult> {
    const created = parseToolResult<CreateSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-create-scene",
        arguments: { path: "s0", name: "NamedTwice" },
      }),
    );

    await sleep(100);

    return created;
  }

  /**
   * Read a scene's name.
   * @param id - The scene
   * @returns Its name
   */
  async function readName(id: string): Promise<string | null> {
    return parseToolResult<ReadSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-read-scene",
        arguments: { id },
      }),
    ).name;
  }

  it("writes a scene named by id and by path once, as the last mention asks", async () => {
    const scene = await createScene();
    const entries = parseBatchResult<UpdateSceneResult>(
      await updateScene({
        id: scene.id,
        path: scene.path,
        name: "First,Second",
      }),
      2,
    );

    // No `ok`: the earlier mention's work happened through the later one.
    expect(entries).toStrictEqual([
      {
        id: scene.id,
        detail: `named again as "${scene.path}" later in this call`,
      },
      { id: scene.id, path: scene.path },
    ]);
    await sleep(100);
    expect(await readName(scene.id)).toBe("Second");
  });

  it("refuses a path it can't parse, writing nothing", async () => {
    const scene = await createScene();
    const result = await updateScene({
      path: `${scene.path},not-a-path`,
      name: "Refused,Refused",
    });

    expect(getToolErrorMessage(result)).toContain('invalid path "not-a-path"');
    expect(await readName(scene.id)).toBe("NamedTwice");
  });

  it("refuses a call that names scenes and asks nothing of them", async () => {
    const scene = await createScene();
    const result = await updateScene({ id: scene.id });

    expect(getToolErrorMessage(result)).toContain("nothing to update");
  });
});

interface CreateSceneResult {
  id: string;
  path: string;
}

interface UpdateSceneResult {
  id: string;
  path?: string;
  color?: string;
  detail?: string;
}

interface ReadSceneResult {
  id: string | null;
  name: string | null;
  color?: string;
  tempo?: number;
  timeSignature?: string;
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-delete tool
 * Deletes tracks, scenes, clips, devices, and drum pads in the Live Set.
 * Uses: e2e-test-set (Producer Pal is on t11)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- operations/ppal-delete
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  extractToolResultText,
  parseAliasedToolResult,
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { EMPTY_MIDI_TRACK, RACKS_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

describe("ppal-delete", () => {
  /**
   * Delete one or more objects.
   * @param args - ppal-delete arguments
   * @returns The raw tool result
   */
  async function del(args: Record<string, unknown>): Promise<unknown> {
    return ctx.client!.callTool({ name: "ppal-delete", arguments: args });
  }

  /**
   * Assert an object is gone by reading it back.
   * @param tool - Read tool to try
   * @param args - Read arguments
   */
  async function expectGone(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    const text = extractToolResultText(
      await ctx.client!.callTool({ name: tool, arguments: args }),
    );

    expect(text.toLowerCase()).toMatch(/error|not found|invalid/);
  }

  /**
   * Create a track and let Live settle.
   * @param args - ppal-create-track arguments
   * @returns The new track
   */
  async function createTrack(
    args: Record<string, unknown>,
  ): Promise<CreateTrackResult> {
    const track = parseToolResult<CreateTrackResult>(
      await ctx.client!.callTool({
        name: "ppal-create-track",
        arguments: args,
      }),
    );

    await sleep(100);

    return track;
  }

  /**
   * Create a scene and let Live settle.
   * @param args - ppal-create-scene arguments
   * @returns The new scene
   */
  async function createScene(
    args: Record<string, unknown>,
  ): Promise<CreateSceneResult> {
    const scene = parseToolResult<CreateSceneResult>(
      await ctx.client!.callTool({
        name: "ppal-create-scene",
        arguments: args,
      }),
    );

    await sleep(100);

    return scene;
  }

  /**
   * Create an empty session clip and let Live settle.
   * @param path - Clip slot path
   * @returns The new clip
   */
  async function createClip(path: string): Promise<CreateClipResult> {
    const clip = parseToolResult<CreateClipResult>(
      await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: { path },
      }),
    );

    await sleep(100);

    return clip;
  }

  it("deletes a track by id, spelled the way a model guesses it", async () => {
    // "ids" is a permanent alias, so this checks the delete and the steer.
    const track = await createTrack({ name: "Track to Delete" });
    const deleted = parseAliasedToolResult<DeleteResult>(
      await del({ ids: track.id, type: "track" }),
      "ppal-delete",
      "ids",
      "id",
    );

    expect(deleted.id).toBe(track.id);
    expect(deleted.type).toBe("track");
    expect(deleted.deleted).toBe(true);

    await expectGone("ppal-read-track", { id: track.id });
  });

  it("deletes several tracks in one call", async () => {
    const track1 = await createTrack({ name: "Multi Delete 1" });
    const track2 = await createTrack({ name: "Multi Delete 2" });
    const deleted = parseToolResult<DeleteResult[]>(
      await del({ id: `${track1.id},${track2.id}`, type: "track" }),
    );

    expect(deleted).toHaveLength(2);
    expect(deleted.every((d) => d.deleted)).toBe(true);
  });

  it("deletes a return track", async () => {
    const returnTrack = await createTrack({
      path: "rt+",
      name: "Return to Delete",
    });
    const deleted = parseToolResult<DeleteResult>(
      await del({ id: returnTrack.id, type: "track" }),
    );

    expect(deleted.deleted).toBe(true);
  });

  /**
   * Read a track by id or index.
   * @param args - ppal-read-track arguments
   * @returns The track
   */
  async function readTrack(
    args: Record<string, unknown>,
  ): Promise<{ id: string }> {
    return parseToolResult<{ id: string }>(
      await ctx.client!.callTool({ name: "ppal-read-track", arguments: args }),
    );
  }

  /** t11 hosts the Producer Pal device in e2e-test-set. */
  const readHostTrack = () => readTrack({ path: "t11" });

  /**
   * Assert a delete result refused the host track and left it in place.
   * @param result - The host's entry in the delete result
   * @param warnings - Warnings the call raised
   * @param hostId - The host track's id
   */
  async function expectHostSurvived(
    result: DeleteResult | undefined,
    warnings: string[],
    hostId: string,
  ): Promise<void> {
    expect(result?.id).toBe(hostId);
    expect(result?.deleted).toBe(false);
    expect(warnings.join(" ").toLowerCase()).toContain("producer pal");
    expect((await readTrack({ id: hostId })).id).toBe(hostId);
  }

  it("refuses to delete the track hosting Producer Pal", async () => {
    const hostTrack = await readHostTrack();
    const { data, warnings } = parseToolResultWithWarnings<DeleteResult>(
      await del({ id: hostTrack.id, type: "track" }),
    );

    await expectHostSurvived(data, warnings, hostTrack.id);
  });

  // Deleting a track above the host renumbers the host mid-call, so the guard's
  // two sides could in principle disagree. They don't: `object.path` is Max's
  // live path, which follows the track down, and the descending sort evaluates
  // the host before anything above it anyway. Verified by reversing the sort —
  // the host is still refused. So this pins the guard end-to-end under
  // renumbering; it is not load-bearing against a stale index.
  it("still refuses the host track after a track above it is deleted in the same call", async () => {
    const hostTrack = await readHostTrack();
    // Above the host, so deleting it renumbers the host.
    const above = await createTrack({ path: "t0", name: "Above Host" });
    const { data, warnings } = parseToolResultWithWarnings<DeleteResult[]>(
      await del({ id: `${above.id},${hostTrack.id}`, type: "track" }),
    );
    // Deletes run highest-index-first, so the results are not in argument
    // order. Match by id.
    const deletedAbove = data.find((result) => result.id === above.id);

    expect(deletedAbove?.deleted).toBe(true);
    await expectHostSurvived(
      data.find((result) => result.id === hostTrack.id),
      warnings,
      hostTrack.id,
    );
  });

  it("deletes a scene, and several scenes in one call", async () => {
    const scene = await createScene({ path: "s0", name: "Scene to Delete" });
    const deleted = parseToolResult<DeleteResult>(
      await del({ id: scene.id, type: "scene" }),
    );

    expect(deleted.type).toBe("scene");
    expect(deleted.deleted).toBe(true);

    const scene1 = await createScene({ path: "s0", name: "Multi Scene 1" });
    const scene2 = await createScene({ path: "s1", name: "Multi Scene 2" });
    const deletedScenes = parseToolResult<DeleteResult[]>(
      await del({ id: `${scene1.id},${scene2.id}`, type: "scene" }),
    );

    expect(deletedScenes).toHaveLength(2);
    expect(deletedScenes.every((d) => d.deleted)).toBe(true);
  });

  it("deletes a clip by id", async () => {
    const clip = await createClip(`t${EMPTY_MIDI_TRACK}/s0`);
    const deleted = parseToolResult<DeleteResult>(
      await del({ id: clip.id, type: "clip" }),
    );

    expect(deleted.type).toBe("clip");
    expect(deleted.deleted).toBe(true);

    await expectGone("ppal-read-clip", { id: clip.id });
  });

  it("deletes several clips in one call", async () => {
    const clip1 = await createClip(`t${EMPTY_MIDI_TRACK}/s1`);
    const clip2 = await createClip(`t${EMPTY_MIDI_TRACK}/s2`);
    const deleted = parseToolResult<DeleteResult[]>(
      await del({ id: `${clip1.id},${clip2.id}`, type: "clip" }),
    );

    expect(deleted).toHaveLength(2);
    expect(deleted.every((d) => d.deleted)).toBe(true);
  });

  it("deletes a device by id", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Compressor",
      `t${RACKS_TRACK}`,
    );
    const deleted = parseToolResult<DeleteResult>(
      await del({ id: deviceId, type: "device" }),
    );

    expect(deleted.type).toBe("device");
    expect(deleted.deleted).toBe(true);

    await expectGone("ppal-read-device", { id: deviceId });
  });

  it("deletes a device by path", async () => {
    const created = parseToolResult<{ path: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "EQ Eight", path: `t${RACKS_TRACK}` },
      }),
    );

    await sleep(100);

    const deleted = parseToolResult<DeleteResult>(
      await del({ path: created.path, type: "device" }),
    );

    expect(deleted.deleted).toBe(true);
  });

  it("deletes several devices in one call", async () => {
    const device1Id = await createTestDevice(ctx.client!, "Auto Filter", "t10");
    const device2Id = await createTestDevice(
      ctx.client!,
      "Chorus-Ensemble",
      `t${RACKS_TRACK}`,
    );
    const deleted = parseToolResult<DeleteResult[]>(
      await del({ id: `${device1Id},${device2Id}`, type: "device" }),
    );

    expect(deleted).toHaveLength(2);
    expect(deleted.every((d) => d.deleted)).toBe(true);
  });

  it("reports a path that names nothing, rather than an empty result", async () => {
    // An empty result reads as "nothing to do", and a model that skims past
    // the warning then reports the delete as done.
    const { data, warnings } = parseToolResultWithWarnings<DeleteResult>(
      await del({ path: "t99/d99", type: "device" }),
    );

    expect(data).toStrictEqual({
      path: "t99/d99",
      type: "device",
      deleted: false,
    });
    expect(warnings.join(" ")).toContain("t99/d99");
  });

  it("reports a miss alongside the deletes in the same call", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Compressor",
      `t${RACKS_TRACK}`,
    );
    const { data, warnings } = parseToolResultWithWarnings<DeleteResult[]>(
      await del({ id: `${deviceId},99999`, type: "device" }),
    );

    expect(data).toStrictEqual([
      { id: deviceId, type: "device", deleted: true },
      { id: "99999", type: "device", deleted: false },
    ]);
    expect(warnings.join(" ")).toContain("99999");
  });

  it("deletes a drum pad by path, spelled the way a model guesses it", async () => {
    // "paths" is a permanent alias, so this checks the delete and the steer.
    // t0/d0 is the Drum Rack "505 Classic Kit" with pads pC1, pD1, pEb1, pGb1
    const deleted = parseAliasedToolResult<DeleteResult>(
      await del({ paths: "t0/d0/pC1", type: "drum-pad" }),
      "ppal-delete",
      "paths",
      "path",
    );

    expect(deleted.type).toBe("drum-pad");
    expect(deleted.deleted).toBe(true);
  });
});

interface DeleteResult {
  /** The object's id, when the target resolved to one. */
  id?: string;
  /** The path instead, when it named nothing. */
  path?: string;
  type: string;
  deleted: boolean;
}

interface CreateTrackResult {
  id: string;
  path?: string;
  returnTrackIndex?: number;
}

interface CreateSceneResult {
  id: string;
  path: string;
}

interface CreateClipResult {
  id: string;
}

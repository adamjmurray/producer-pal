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
  getToolErrorMessage,
  isToolError,
  parseAliasedToolResult,
  parseToolResult,
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
   * Read a device, chain, or drum pad back.
   * @param args - ppal-read-device arguments
   * @returns The raw tool result
   */
  async function readDevice(args: Record<string, unknown>): Promise<unknown> {
    return ctx.client!.callTool({ name: "ppal-read-device", arguments: args });
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
      "ids",
      "id",
    );

    expect(deleted.id).toBe(track.id);
    expect(deleted.type).toBe("track");
    // `ok` is on skips only, so a delete that landed carries none.
    expect(deleted.ok).toBeUndefined();

    await expectGone("ppal-read-track", { id: track.id });
  });

  it("deletes several tracks in one call", async () => {
    const track1 = await createTrack({ name: "Multi Delete 1" });
    const track2 = await createTrack({ name: "Multi Delete 2" });
    const deleted = parseToolResult<DeleteResult[]>(
      await del({ id: `${track1.id},${track2.id}`, type: "track" }),
    );

    expect(deleted).toHaveLength(2);
    expect(deleted.every((d) => d.ok === undefined)).toBe(true);
  });

  it("deletes a return track", async () => {
    const returnTrack = await createTrack({
      path: "rt+",
      name: "Return to Delete",
    });
    const deleted = parseToolResult<DeleteResult>(
      await del({ id: returnTrack.id, type: "track" }),
    );

    // The index depends on how many return tracks the Set already had.
    expect(deleted.deletedPath).toMatch(/^rt\d+$/);
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
   * Assert a delete result refused the host track and left it in place. The
   * reason rides on the host's own entry, so nothing warns.
   * @param result - The host's entry in the delete result
   * @param hostId - The host track's id
   */
  async function expectHostSurvived(
    result: DeleteResult | undefined,
    hostId: string,
  ): Promise<void> {
    expect(result?.id).toBe(hostId);
    expect(result?.ok).toBe(false);
    expect(result?.reason?.toLowerCase()).toContain("producer pal");
    expect((await readTrack({ id: hostId })).id).toBe(hostId);
  }

  it("refuses to delete the track hosting Producer Pal", async () => {
    const hostTrack = await readHostTrack();
    // The only target named, so nothing was deleted and the reason is an error.
    const result = await del({ id: hostTrack.id, type: "track" });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result).toLowerCase()).toContain("producer pal");
    expect((await readTrack({ id: hostTrack.id })).id).toBe(hostTrack.id);
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
    // Named beside another target, so the refusal is an entry rather than an
    // error — and it is the entry, not a warning, that carries the reason.
    const data = parseToolResult<DeleteResult[]>(
      await del({ id: `${above.id},${hostTrack.id}`, type: "track" }),
    );
    // Matched by id rather than position: what this pins is the guard, and the
    // entries' order is covered by ppal-delete-batch-ordering.
    const deletedAbove = data.find((result) => result.id === above.id);

    expect(deletedAbove?.ok).toBeUndefined();
    await expectHostSurvived(
      data.find((result) => result.id === hostTrack.id),
      hostTrack.id,
    );
  });

  it("deletes a scene, and several scenes in one call", async () => {
    const scene = await createScene({ path: "s0", name: "Scene to Delete" });
    const deleted = parseToolResult<DeleteResult>(
      await del({ id: scene.id, type: "scene" }),
    );

    expect(deleted.type).toBe("scene");
    expect(deleted.ok).toBeUndefined();

    const scene1 = await createScene({ path: "s0", name: "Multi Scene 1" });
    const scene2 = await createScene({ path: "s1", name: "Multi Scene 2" });
    const deletedScenes = parseToolResult<DeleteResult[]>(
      await del({ id: `${scene1.id},${scene2.id}`, type: "scene" }),
    );

    expect(deletedScenes).toHaveLength(2);
    expect(deletedScenes.every((d) => d.ok === undefined)).toBe(true);
  });

  it("deletes a clip by id", async () => {
    const clip = await createClip(`t${EMPTY_MIDI_TRACK}/s0`);
    const deleted = parseToolResult<DeleteResult>(
      await del({ id: clip.id, type: "clip" }),
    );

    expect(deleted.type).toBe("clip");
    expect(deleted.ok).toBeUndefined();

    await expectGone("ppal-read-clip", { id: clip.id });
  });

  // A deleted object has no live address, so the result says which key it is:
  // `deletedPath` for a removal, `path` only while the target is still there.
  it("names what it removed, in the spelling the caller used", async () => {
    const path = `t${EMPTY_MIDI_TRACK}/s0`;

    await createClip(path);

    const byPath = parseToolResult<DeleteResult>(
      await del({ path, type: "clip" }),
    );

    expect(byPath.deletedPath).toBe(path);
    expect(byPath.path).toBeUndefined();

    // Named by id, so the result reports the address the clip had.
    const clip = await createClip(path);
    const byId = parseToolResult<DeleteResult>(
      await del({ id: clip.id, type: "clip" }),
    );

    expect(byId.deletedPath).toBe(path);
    expect(byId.path).toBeUndefined();
  });

  it("deletes several clips in one call", async () => {
    const clip1 = await createClip(`t${EMPTY_MIDI_TRACK}/s1`);
    const clip2 = await createClip(`t${EMPTY_MIDI_TRACK}/s2`);
    const deleted = parseToolResult<DeleteResult[]>(
      await del({ id: `${clip1.id},${clip2.id}`, type: "clip" }),
    );

    expect(deleted).toHaveLength(2);
    expect(deleted.every((d) => d.ok === undefined)).toBe(true);
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
    expect(deleted.ok).toBeUndefined();

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

    expect(deleted.ok).toBeUndefined();
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
    expect(deleted.every((d) => d.ok === undefined)).toBe(true);
  });

  // Nothing is there to remove, so the delete it asked for has already
  // happened: the entry says so, carries no `ok`, and nothing warns.
  it("reports a path that names nothing as nothing to delete", async () => {
    const data = parseToolResult<DeleteResult>(
      await del({ path: "t99/d99", type: "device" }),
    );

    expect(data).toStrictEqual({
      path: "t99/d99",
      type: "device",
      reason: "nothing to delete",
    });
  });

  it("reports an id that isn't there alongside the deletes", async () => {
    const deviceId = await createTestDevice(
      ctx.client!,
      "Compressor",
      `t${RACKS_TRACK}`,
    );
    // parseToolResult fails the test if anything warned: the entries carry it.
    const data = parseToolResult<DeleteResult[]>(
      await del({ id: `${deviceId},99999`, type: "device" }),
    );

    expect(data).toStrictEqual([
      {
        id: deviceId,
        // The index isn't portable — a machine's default track preset decides
        // how many devices the track already had.
        deletedPath: expect.stringMatching(
          new RegExp(`^t${RACKS_TRACK}/d\\d+$`),
        ),
        type: "device",
      },
      { id: "99999", type: "device", reason: "nothing to delete" },
    ]);
  });

  // A wrong-kind target is a skip, not a no-op: the object is there, and this
  // call can't remove it as the type it named.
  it("keeps a wrong-type target's slot, with no warning", async () => {
    // The scene comes first: creating one at s0 shifts every slot below it, so
    // a clip made before it would no longer be where it was created.
    const scene = await createScene({ path: "s0", name: "Wrong Type" });
    const clip = await createClip(`t${EMPTY_MIDI_TRACK}/s3`);

    expect(clip.path).toBe(`t${EMPTY_MIDI_TRACK}/s3`);

    const data = parseToolResult<DeleteResult[]>(
      await del({ id: `${clip.id},${scene.id}`, type: "clip" }),
    );

    expect(data[0]).toStrictEqual({
      // The address the clip itself reported, not an assumed slot.
      deletedPath: clip.path,
      id: clip.id,
      type: "clip",
    });
    expect(data[1]).toStrictEqual({
      id: scene.id,
      type: "clip",
      ok: false,
      reason: expect.stringContaining("is not a clip"),
    });
  });

  it("refuses a lone target of the wrong type", async () => {
    const scene = await createScene({ path: "s0", name: "Lone Wrong Type" });
    const result = await del({ id: scene.id, type: "clip" });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("is not a clip");
  });

  // Live has no way to remove a drum pad — the 128 slots are permanent — so a
  // delete clears the pad's chains and leaves the slot. This pins the three
  // things that make that read as a deletion anyway. See ADR-0034.
  it("deletes a drum pad by path, spelled the way a model guesses it", async () => {
    // "paths" is a permanent alias, so this checks the delete and the steer.
    // t0/d0 is the Drum Rack "505 Classic Kit" with pads pC1, pD1, pEb1, pGb1
    const deleted = parseAliasedToolResult<DeleteResult>(
      await del({ paths: "t0/d0/pC1", type: "drum-pad" }),
      "paths",
      "path",
    );

    expect(deleted.type).toBe("drum-pad");
    expect(deleted.ok).toBeUndefined();
    // The slot outlives the call, so the address comes back under `path`.
    expect(deleted.path).toBe("t0/d0/pC1");
    expect(deleted.deletedPath).toBeUndefined();

    const rack = parseToolResult<DrumRackRead>(
      await readDevice({ path: "t0/d0", include: ["drum-pads", "drum-map"] }),
    );

    // The rack reads as though the pad were gone.
    expect(rack.drumPads.map((pad) => pad.pitch)).not.toContain("C1");
    expect(Object.keys(rack.drumMap)).not.toContain("C1");

    const cleared = parseToolResult<DrumPadRead>(
      await readDevice({ path: "t0/d0/pC1", include: ["chains"] }),
    );
    const neverFilled = parseToolResult<DrumPadRead>(
      await readDevice({ path: "t0/d0/pE1", include: ["chains"] }),
    );

    // ...but the slot is still there, keeping the id the delete reported.
    expect(cleared.id).toBe(deleted.id);
    expect(cleared.chains).toStrictEqual([]);
    // Live renames a cleared pad to its own pitch, so nothing tells it apart
    // from a pad that was never filled.
    expect(cleared.name).toBe("C1");
    expect(neverFilled.name).toBe("E1");
    expect(neverFilled.chains).toStrictEqual([]);
    expect(Object.keys(cleared).toSorted()).toStrictEqual(
      Object.keys(neverFilled).toSorted(),
    );
  });
});

interface DeleteResult {
  /** The object's id, when the target resolved to one. */
  id?: string;
  /** The address of an object this call removed, as it was before the call. */
  deletedPath?: string;
  /** The target's address when it is still there. */
  path?: string;
  type: string;
  /** Only on a target this call could not delete. */
  ok?: false;
  /** Why it wasn't deleted, or why there was nothing to delete. */
  reason?: string;
}

interface DrumRackRead {
  drumPads: { id: string; path: string; pitch: string }[];
  drumMap: Record<string, string>;
}

interface DrumPadRead {
  id: string;
  path: string;
  name: string;
  note: number;
  pitch: string;
  chains: unknown[];
}

interface CreateTrackResult {
  id: string;
  path?: string;
}

interface CreateSceneResult {
  id: string;
  path: string;
}

interface CreateClipResult {
  id: string;
  /** Where the clip landed, e.g. "t8/s3" */
  path?: string;
}

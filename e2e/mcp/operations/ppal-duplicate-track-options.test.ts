// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the ppal-duplicate track options that only real Live can prove:
 * withoutDevices, routeToSource with its routing and arm side effects, and
 * copying from a group track, which Live copies members and all.
 * Uses: e2e-test-set (t0 Drums has a drum rack and a clip, t1 Bass has a rack,
 * t9 Parent is a group holding t10 Child, which has Operator)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- operations/ppal-duplicate-track-options
 */
import { describe, expect, it } from "vitest";
import {
  createTestDeviceAt,
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface LiveSetTracks {
  tracks: Array<{ id: string; name: string; groupId?: string }>;
}

interface DuplicateTrackResult {
  id: string;
  clips?: unknown[];
  detail?: string;
}

interface ReadTrackResult {
  id: string;
  name: string;
  deviceCount?: number;
  sessionClipCount?: number;
  isArmed?: boolean;
  inputRoutingType?: { name: string } | null;
  outputRoutingType?: { name: string } | null;
}

async function readTracks(): Promise<LiveSetTracks> {
  return parseToolResult<LiveSetTracks>(
    await ctx.client!.callTool({
      name: "ppal-read-live-set",
      arguments: { include: ["tracks"] },
    }),
  );
}

async function readTrack(id: string): Promise<ReadTrackResult> {
  return parseToolResult<ReadTrackResult>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { id, include: ["routings"] },
    }),
  );
}

interface DeviceSummary {
  id: string;
  type: string;
}

async function readDevices(path: string): Promise<DeviceSummary[]> {
  const track = parseToolResult<{ devices?: DeviceSummary[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: { path, include: ["devices"] },
    }),
  );

  return track.devices ?? [];
}

describe("ppal-duplicate track options", () => {
  it("copies a track without its devices but keeps the clips", async () => {
    const drums = (await readTracks()).tracks[0]!;
    const source = await readTrack(drums.id);

    expect(source.deviceCount).toBeGreaterThan(0);
    expect(source.sessionClipCount).toBeGreaterThan(0);

    const copy = parseToolResult<DuplicateTrackResult>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "track", id: drums.id, withoutDevices: true },
      }),
    );

    await sleep(100);
    const copied = await readTrack(copy.id);

    expect(copied.deviceCount).toBe(0);
    expect(copied.sessionClipCount).toBe(source.sessionClipCount);
  });

  it("routes the copy back to the source track, saying so on the copy's entry", async () => {
    const bass = (await readTracks()).tracks[1]!;

    const { data: copy, warnings } =
      parseToolResultWithWarnings<DuplicateTrackResult>(
        await ctx.client!.callTool({
          name: "ppal-duplicate",
          arguments: { type: "track", id: bass.id, routeToSource: true },
        }),
      );

    await sleep(100);
    const copied = await readTrack(copy.id);

    // The copy is a bare MIDI feeder: no instrument of its own, nothing to play.
    expect(copied.deviceCount).toBe(0);
    expect(copied.sessionClipCount).toBe(0);
    // Live's own routing list is what makes this work, so the name it reports
    // back is the only proof the copy actually reaches the source track.
    expect(copied.outputRoutingType?.name).toBe(bass.name);

    const source = await readTrack(bass.id);

    expect(source.isArmed).toBe(true);
    expect(source.inputRoutingType?.name).toBe("No Input");

    // What the call did to the source belongs to the copy it did it for.
    expect(copy.detail).toContain("armed it");
    expect(copy.detail).toContain('set its input to "No Input"');
    expect(warnings).toStrictEqual([]);
  });

  it("reports each copy's clips on the track that copy ended up on", async () => {
    const drums = (await readTracks()).tracks[0]!;

    const copies = parseToolResult<
      Array<{ id: string; path: string; clips: Array<{ path: string }> }>
    >(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "track", id: drums.id, count: 2, name: "P,Q" },
      }),
    );

    // Drums has a session clip in s0 and an arrangement clip at 1|1.
    expect(copies.map((c) => c.path)).toStrictEqual(["t1", "t2"]);
    expect(copies[0]!.clips.map((c) => c.path)).toStrictEqual([
      "t1/s0",
      "t1[1|1]",
    ]);
    expect(copies[1]!.clips.map((c) => c.path)).toStrictEqual([
      "t2/s0",
      "t2[1|1]",
    ]);
  });

  it("routes every copy the same way when making several", async () => {
    const keys = (await readTracks()).tracks[2]!;

    const { data: copies } = parseToolResultWithWarnings<
      DuplicateTrackResult[]
    >(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "track",
          id: keys.id,
          count: 2,
          routeToSource: true,
          name: "X,Y",
        },
      }),
    );

    await sleep(100);
    const [x, y] = await Promise.all(copies.map((c) => readTrack(c.id)));

    // Routing takes the source's input away; every copy was made before that.
    expect(x!.name).toBe("X");
    expect(y!.name).toBe("Y");
    expect(y!.inputRoutingType).toStrictEqual(x!.inputRoutingType);
    expect(x!.outputRoutingType?.name).toBe(keys.name);
    expect(y!.outputRoutingType?.name).toBe(keys.name);
  });

  it("says once which copy params routeToSource settles itself", async () => {
    const bass = (await readTracks()).tracks[1]!;

    const { warnings } = parseToolResultWithWarnings<DuplicateTrackResult>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "track",
          id: bass.id,
          routeToSource: true,
          withoutClips: false,
          withoutDevices: false,
        },
      }),
    );

    // One warning for the pair, not one each: it is about the call's params,
    // which no copy's entry can speak for.
    expect(warnings).toStrictEqual([
      "WARNING: withoutClips/withoutDevices ignored: routeToSource always " +
        "copies without clips and devices",
    ]);
  });

  it("refuses routeToSource for anything but a track", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "scene", id: "0", routeToSource: true },
    });

    expect(JSON.stringify(result)).toContain(
      "routeToSource is only supported for type 'track'",
    );
  });
});

describe("ppal-duplicate from a group track", () => {
  it("copies a device off the group without touching its member", async () => {
    const before = (await readTracks()).tracks;
    const devicePath = await createTestDeviceAt(ctx.client!, "Saturator", "t9");

    const copy = parseToolResult<{ id: string; path: string }>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "device", path: devicePath, toPath: "t8" },
      }),
    );

    await sleep(100);

    // The temp copy of the group, member and all, is gone again.
    expect((await readTracks()).tracks.map((t) => t.id)).toStrictEqual(
      before.map((t) => t.id),
    );
    expect(copy.path).toBe("t8/d0");
    expect(await readDevices("t8")).toStrictEqual([
      expect.objectContaining({ id: copy.id, type: "audio-effect: Saturator" }),
    ]);
    expect(await readDevices("t10")).toStrictEqual([
      expect.objectContaining({ type: "instrument: Operator" }),
    ]);
  });

  it("makes every copy of the group from the group itself", async () => {
    const before = (await readTracks()).tracks;
    const parent = before[9]!;

    const copies = parseToolResult<Array<{ id: string; path: string }>>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "track", id: parent.id, count: 2, name: "A,B" },
      }),
    );

    await sleep(100);
    const after = (await readTracks()).tracks;

    // Parent, Child, A, A's member, B, B's member, then the rest.
    expect(after).toHaveLength(before.length + 4);
    expect(copies).toStrictEqual([
      expect.objectContaining({ id: after[11]!.id, path: "t11" }),
      expect.objectContaining({ id: after[13]!.id, path: "t13" }),
    ]);
    expect(after.slice(9, 15).map((t) => t.name)).toStrictEqual([
      "Parent",
      "Child",
      "A",
      "Child",
      "B",
      "Child",
    ]);
    expect(after[10]).toStrictEqual(before[10]);
    expect(after[12]!.groupId).toBe(after[11]!.id);
    expect(after[14]!.groupId).toBe(after[13]!.id);
  });

  it("reports and strips the members' copies, not just the group's", async () => {
    const clip = parseToolResult<{ id: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: { path: "t10/s0", notes: "C3 1|1" },
      }),
    );
    const parentId = (await readTracks()).tracks[9]!.id;

    const full = parseToolResult<DuplicateTrackResult>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "track", id: parentId },
      }),
    );

    await sleep(100);

    // Live puts the copy right after the group, its member copy right after it.
    expect(full.clips).toStrictEqual([
      expect.objectContaining({ path: "t12/s0" }),
    ]);
    expect(full.clips).not.toContainEqual(
      expect.objectContaining({ id: clip.id }),
    );

    const bare = parseToolResult<DuplicateTrackResult>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "track",
          id: parentId,
          withoutClips: true,
          withoutDevices: true,
        },
      }),
    );

    await sleep(100);
    const tracks = (await readTracks()).tracks;
    const bareMember = tracks[12]!;

    expect(bare.clips).toStrictEqual([]);
    expect(bareMember.groupId).toBe(bare.id);
    expect(await readDevices("t12")).toStrictEqual([]);
    expect((await readTrack(bareMember.id)).sessionClipCount ?? 0).toBe(0);
    // The source member keeps its own.
    expect(await readDevices("t10")).toStrictEqual([
      expect.objectContaining({ type: "instrument: Operator" }),
    ]);
  });
});

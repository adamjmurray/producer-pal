// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E sweep across the write tools: the same multi-target call, once by `path`
 * and once by `id`, answers with the same entries in the same order, each
 * addressed by the spelling its caller wrote (ADR-0042).
 *
 * Every case names a target the call refuses or can only half serve — the
 * entries that used to be dropped or turned into a warning, and the ones most
 * likely to drift apart between the two spellings.
 *
 * Ids are read out of the Set here, never written down: Live reassigns them
 * every time it opens a Set, so a literal id names a different object on the
 * next run.
 *
 * Uses: e2e-test-set. See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- operations/target-entry-parity
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  readIdAtPath,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** t8, the empty MIDI track the cases pair a refused target with. */
const SCRATCH = `t${EMPTY_MIDI_TRACK}`;

/** A colour Live's palette already holds, so writing it raises no snap warning. */
const PALETTE_RED = "#FF3636";

/** One entry of a multi-target write result. */
interface TargetEntry {
  id?: string;
  path?: string;
  ok?: false;
  reason?: string;
  [field: string]: unknown;
}

/** One object a case names, in both spellings. */
interface ParityTarget {
  path: string;
  id: string;
  /**
   * The spelling names no object at all, so each call can only quote its own
   * back and the two reasons read differently. Everything else still matches.
   */
  namesNothing?: boolean;
}

describe("a write answers the same by path and by id", () => {
  it("update-track: the letter Live puts back on a renamed return track", async () => {
    const returnTrackId = await idAt("ppal-read-track", "rt0");
    const [returnTrack] = await expectSameEntriesBothWays(
      "ppal-update-track",
      { name: "Foo" },
      [
        { path: "rt0", id: returnTrackId },
        { path: SCRATCH, id: await idAt("ppal-read-track", SCRATCH) },
      ],
    );

    expect(returnTrack).toStrictEqual({
      id: returnTrackId,
      path: "rt0",
      name: "A-Foo",
      reason: "Live prefixes a return track's name with its send letter",
    });
  });

  it("update-track: a send level Live rounded, on the send's own entry", async () => {
    const [track] = await expectSameEntriesBothWays(
      "ppal-update-track",
      { sends: [{ return: "A", gainDb: -12.345 }] },
      [
        { path: "t0", id: await idAt("ppal-read-track", "t0") },
        { path: SCRATCH, id: await idAt("ppal-read-track", SCRATCH) },
      ],
    );

    expect(track!.sends).toStrictEqual([
      {
        return: "A-Delay",
        returnId: await idAt("ppal-read-track", "rt0"),
        gainDb: -12.35,
        reason: "gainDb read back as shown, not as sent",
      },
    ]);
  });

  it("update-track: the params a take lane has no use for", async () => {
    const lane = parseToolResult<{ id: string; path: string }>(
      await ctx.client!.callTool({
        name: "ppal-update-track",
        arguments: { path: `${SCRATCH}/l+`, name: "Take A" },
      }),
    );

    await sleep(100);

    const [entry] = await expectSameEntriesBothWays(
      "ppal-update-track",
      { color: PALETTE_RED },
      [
        { path: lane.path, id: lane.id },
        { path: SCRATCH, id: await idAt("ppal-read-track", SCRATCH) },
      ],
    );

    expect(entry).toStrictEqual({
      id: lane.id,
      path: lane.path,
      name: "Take A",
      ok: false,
      reason: "a take lane takes only name; ignored color",
    });
  });

  it("update-clip: a param the clip's own type can't use", async () => {
    const [midiClip] = await expectSameEntriesBothWays(
      "ppal-update-clip",
      { name: "P", warpMode: "beats" },
      [
        { path: "t0/s0", id: await idAt("ppal-read-clip", "t0/s0") },
        { path: "t4/s0", id: await idAt("ppal-read-clip", "t4/s0") },
      ],
    );

    expect(midiClip!.reason).toBe("warpMode ignored: the clip is MIDI");
  });

  it("update-scene: a target that names nothing keeps its slot", async () => {
    const [, missing] = await expectSameEntriesBothWays(
      "ppal-update-scene",
      { name: "Z" },
      [
        { path: "s3", id: await idAt("ppal-read-scene", "s3") },
        { path: "s99", id: "99999", namesNothing: true },
      ],
    );

    expect(missing).toStrictEqual({
      path: "s99",
      ok: false,
      reason: 'no scene at path "s99"',
    });
  });

  it("update-device: a param name the device doesn't have", async () => {
    const rackId = await idAt("ppal-read-device", "t0/d0");
    const [rack] = await expectSameEntriesBothWays(
      "ppal-update-device",
      { params: [{ name: "Nope", value: 1 }] },
      [
        { path: "t0/d0", id: rackId },
        { path: "t10/d0", id: await idAt("ppal-read-device", "t10/d0") },
      ],
    );

    expect(rack!.params).toStrictEqual([
      { name: "Nope", ok: false, reason: `not found on t0/d0 (id ${rackId})` },
    ]);
  });

  it("update-device: a params list on a chain and on a drum pad", async () => {
    const chainId = await idAt("ppal-read-device", "t6/d0/c0");
    const [chain, pad] = await expectSameEntriesBothWays(
      "ppal-update-device",
      { params: [{ name: "Volume", value: -6 }] },
      [
        { path: "t6/d0/c0", id: chainId },
        { path: "t0/d0/pC1", id: await idAt("ppal-read-device", "t0/d0/pC1") },
      ],
    );

    expect(chain!.params).toStrictEqual([
      {
        name: "Volume",
        ok: false,
        reason: `'params' not applicable to Chain t6/d0/c0 (id ${chainId})`,
      },
    ]);
    expect(pad!.params).toStrictEqual([
      {
        name: "Volume",
        ok: false,
        reason: `'params' not applicable to DrumChain t0/d0/pC1/c0 (id ${await idAt("ppal-read-device", "t0/d0/pC1/c0")})`,
      },
    ]);
  });

  it("update-device: a drum pad with no chains to write to", async () => {
    const emptyPadId = await idAt("ppal-read-device", "t0/d0/pC2");
    const [, emptyPad] = await expectSameEntriesBothWays(
      "ppal-update-device",
      { mute: true },
      [
        { path: "t0/d0/pC1", id: await idAt("ppal-read-device", "t0/d0/pC1") },
        { path: "t0/d0/pC2", id: emptyPadId },
      ],
    );

    expect(emptyPad).toStrictEqual({
      path: "t0/d0/pC2",
      ok: false,
      reason: `drum pad t0/d0/pC2 (id ${emptyPadId}) has no chains, so there is nothing to update — Live ignores writes to an empty pad`,
    });
  });

  it("update-device: a chain send level Live rounded", async () => {
    const [pad] = await expectSameEntriesBothWays(
      "ppal-update-device",
      { sends: [{ return: "a", gainDb: -12.345 }] },
      [
        { path: "t0/d0/pC1", id: await idAt("ppal-read-device", "t0/d0/pC1") },
        { path: "t0/d0/pD1", id: await idAt("ppal-read-device", "t0/d0/pD1") },
      ],
    );

    expect(pad!.sends).toStrictEqual([
      {
        return: "a Saturator",
        returnId: await idAt("ppal-read-device", "t0/d0/rc0"),
        gainDb: -12.35,
        reason: "gainDb read back as shown, not as sent",
      },
    ]);
  });

  it("delete: a refusal beside a target that is already gone", async () => {
    const hostTrackId = await idAt("ppal-read-track", "t11");
    const [host, missing] = await expectSameEntriesBothWays(
      "ppal-delete",
      { type: "track" },
      [
        { path: "t11", id: hostTrackId },
        { path: "t99", id: "99999" },
      ],
    );

    expect(host).toStrictEqual({
      id: hostTrackId,
      path: "t11",
      type: "track",
      ok: false,
      reason: `cannot delete track t11 (id ${hostTrackId}), which hosts the Producer Pal device`,
    });
    expect(missing).toStrictEqual({
      path: "t99",
      type: "track",
      reason: "nothing to delete",
    });
  });

  it("duplicate: sources addressed by the caller's own spelling", async () => {
    const rackId = await idAt("ppal-read-device", "t0/d0");
    const hostDeviceId = await idAt("ppal-read-device", "t11/d0");
    const [device, rack] = await expectSameEntriesBothWays(
      "ppal-duplicate",
      { type: "device" },
      [
        { path: "t11/d0", id: hostDeviceId },
        { path: "t0/d0", id: rackId },
      ],
      [
        `WARNING: Live refused the move of t0/d0 (id ${rackId}): the destination already has an instrument, and only one is allowed`,
      ],
    );

    expect(device).toStrictEqual({
      path: "t11/d0",
      ok: false,
      reason: `cannot duplicate the Producer Pal device t11/d0 (id ${hostDeviceId})`,
    });
    expect(rack).toStrictEqual({
      path: "t0/d0",
      ok: false,
      reason: `the copy of t0/d0 (id ${rackId}) could not be moved to "t0/d1"`,
    });
  });
});

/**
 * Fire one call by path and the same call by id, then hold the two results to
 * the parity rule.
 * @param tool - The write tool to call
 * @param args - The call's other arguments, shared by both spellings
 * @param targets - The objects the call names, in order, in both spellings
 * @param warnings - The warnings both calls are expected to raise
 * @returns The entries the path call answered with, for a case's own checks
 */
async function expectSameEntriesBothWays(
  tool: string,
  args: Record<string, unknown>,
  targets: ParityTarget[],
  warnings: string[] = [],
): Promise<TargetEntry[]> {
  const byPath = await callEntries(tool, args, targets, "path", warnings);
  const byId = await callEntries(tool, args, targets, "id", warnings);

  expect(byPath).toHaveLength(targets.length);
  expect(byId).toHaveLength(targets.length);

  targets.forEach((target, index) => {
    expectSameEntry(byPath[index]!, byId[index]!, target);
  });

  return byPath;
}

/**
 * One call, naming every target under a single param.
 * @param tool - The write tool to call
 * @param args - The call's other arguments
 * @param targets - The objects to name
 * @param param - Which spelling to name them by
 * @param warnings - The warnings the call is expected to raise
 * @returns The entries it answered with
 */
async function callEntries(
  tool: string,
  args: Record<string, unknown>,
  targets: ParityTarget[],
  param: "id" | "path",
  warnings: string[],
): Promise<TargetEntry[]> {
  const named = targets.map((target) => target[param]).join(",");
  const { data, warnings: raised } = parseToolResultWithWarnings<TargetEntry[]>(
    await ctx.client!.callTool({
      name: tool,
      arguments: { ...args, [param]: named },
    }),
  );

  expect(raised).toStrictEqual(warnings);
  await sleep(100);

  return data;
}

/**
 * One target's two entries, held to the parity rule.
 * @param fromPath - The entry the path call left in this slot
 * @param fromId - The entry the id call left in the same slot
 * @param target - The object both calls named
 */
function expectSameEntry(
  fromPath: TargetEntry,
  fromId: TargetEntry,
  target: ParityTarget,
): void {
  expect(fromPath.path).toBe(target.path);
  expect(fromId.id).toBe(target.id);

  // A skip that never reached an object has only the caller's spelling to
  // report; an entry that did reach one carries both addresses.
  expect(fromPath.id == null).toBe(fromId.path == null);

  if (fromPath.id != null) {
    expect(fromPath.id).toBe(target.id);
    expect(fromId.path).toBe(target.path);
  }

  if (target.namesNothing) {
    expect(fromPath.reason).toContain(target.path);
    expect(fromId.reason).toContain(target.id);
  }

  expect(comparable(fromPath, target)).toStrictEqual(
    comparable(fromId, target),
  );
}

/**
 * An entry with everything the two spellings are allowed to differ on removed.
 * @param entry - The entry to compare
 * @param target - The object it stands for
 * @returns The fields the two calls have to agree on
 */
function comparable(
  entry: TargetEntry,
  target: ParityTarget,
): Record<string, unknown> {
  const { id: _id, path: _path, ...rest } = entry;

  return target.namesNothing ? { ...rest, reason: "" } : rest;
}

/**
 * This connection's shorthand for reading an object's current id.
 * @param tool - The read tool that owns the object
 * @param path - Producer Pal path to it
 * @returns The object's id
 */
async function idAt(tool: string, path: string): Promise<string> {
  return readIdAtPath(ctx.client!, tool, path);
}

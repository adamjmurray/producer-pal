// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E inventory of the `WARNING:` blocks the tools still raise, and of the
 * calls that raise none. Anything about one target belongs on that target's own
 * entry (ADR-0042), so this suite pins down what is left: a per-target warning
 * slipping back in fails here instead of going unnoticed.
 *
 * Each probe asserts the exact warnings, in order — not "contains", and not
 * "at least". Ids are read out of the Set, since Live reassigns them on open.
 *
 * Uses: e2e-test-set. See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- operations/warning-inventory
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  getToolWarnings,
  parseToolResult,
  parseToolResultWithWarnings,
  readIdAtPath,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** t8, the empty MIDI track the arrangement probes build their clips on. */
const SCRATCH = `t${EMPTY_MIDI_TRACK}`;

/** A colour Live's palette does not hold, so every write of it snaps. */
const OFF_PALETTE = "#123456";

/** What a track's take-lane copy says it left behind. */
const CLIPS_ONLY =
  "clips only: a take lane takes no devices, routing, mixer settings or session clips";

/** One send of a write result: only what these probes read off it. */
interface SendEntry {
  return?: string;
  ok?: false;
  reason?: string;
}

/** One entry of a multi-target write result. */
interface TargetEntry {
  id?: string;
  color?: string;
  path?: string;
  ok?: false;
  reason?: string;
  params?: Array<{ reason?: string }>;
  sends?: SendEntry[];
}

describe("warnings the tools still raise", () => {
  it("says count was ignored by the types that copy once", async () => {
    expect(
      await warningsFrom("ppal-duplicate", {
        type: "device",
        path: "t2/d2",
        count: 2,
      }),
    ).toStrictEqual([
      "WARNING: count 2 ignored: device copies go one per toPath",
    ]);

    expect(
      await warningsFrom("ppal-duplicate", {
        type: "chain",
        path: "t6/d0/c0",
        count: 2,
      }),
    ).toStrictEqual([
      "WARNING: count 2 ignored: chain copies go one per toPath",
    ]);

    expect(
      await warningsFrom("ppal-duplicate", {
        type: "drum-pad",
        path: "t0/d0/pC1",
        toPath: "t0/d0/pC2",
        count: 2,
      }),
    ).toStrictEqual([
      "WARNING: count 2 ignored: drum pad copies go one per toPath",
    ]);
  });

  it("says what a track's take-lane copy has no use for", async () => {
    parseToolResult<CreateClipResult>(
      await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: { path: `${SCRATCH}[1|1]`, notes: "C3 1|1" },
      }),
    );
    await sleep(100);

    const laneCopy = {
      type: "track",
      path: SCRATCH,
      toPath: "t10/l0",
    };

    expect(
      await warningsFrom("ppal-duplicate", { ...laneCopy, count: 2 }),
    ).toStrictEqual([
      "WARNING: count 2 ignored: a track's clips go once to each lane toPath names",
    ]);

    expect(
      await warningsFrom("ppal-duplicate", {
        ...laneCopy,
        toPath: "t10/l1",
        withoutClips: true,
        withoutDevices: true,
      }),
    ).toStrictEqual([
      `WARNING: withoutClips/withoutDevices ignored: ${CLIPS_ONLY}`,
    ]);

    expect(
      await warningsFrom("ppal-duplicate", {
        ...laneCopy,
        toPath: "t10/l2",
        routeToSource: true,
      }),
    ).toStrictEqual([`WARNING: routeToSource ignored: ${CLIPS_ONLY}`]);
  });

  it("names an argument it did not recognise, and a blank destination", async () => {
    expect(
      await warningsFrom("ppal-read-track", { path: "t0", bogusArg: 1 }),
    ).toStrictEqual(["WARNING: ignored unexpected argument(s): bogusArg"]);

    expect(
      await warningsFrom("ppal-update-clip", { path: "t0/s0", toPath: "   " }),
    ).toStrictEqual(["WARNING: blank toPath ignored — leave it out instead"]);
  });

  it("says two clips were moved onto one spot in the same lane", async () => {
    for (const bar of ["1|1", "5|1"]) {
      parseToolResult<CreateClipResult>(
        await ctx.client!.callTool({
          name: "ppal-create-clip",
          arguments: {
            path: `${SCRATCH}[${bar}]`,
            notes: "C3 1|1",
            length: "1bar",
          },
        }),
      );
      await sleep(100);
    }

    expect(
      await warningsFrom("ppal-update-clip", {
        path: `${SCRATCH}[1|1],${SCRATCH}[5|1]`,
        toPath: "[21|1],[21|1]",
      }),
    ).toStrictEqual([
      `WARNING: 2 clips on ${SCRATCH} moved to the same position - later clips will overwrite earlier ones`,
    ]);
  });
});

describe("calls that report on the entry and warn about nothing", () => {
  it("says on each entry that a colour snapped to the palette", async () => {
    const snapped = {
      color: "#3C3C3C",
      reason: expect.stringContaining(
        `color ${OFF_PALETTE} is not in Live's palette; landed as #3C3C3C`,
      ),
    };

    const tracks = await entriesFrom("ppal-update-track", {
      path: `${SCRATCH},t10`,
      color: OFF_PALETTE,
    });

    expect(tracks).toStrictEqual([
      expect.objectContaining(snapped),
      expect.objectContaining(snapped),
    ]);

    const scenes = await entriesFrom("ppal-update-scene", {
      path: "s3,s6",
      color: OFF_PALETTE,
    });

    expect(scenes).toStrictEqual([
      expect.objectContaining(snapped),
      expect.objectContaining(snapped),
    ]);

    const clip = await entryFrom("ppal-update-clip", {
      path: "t0/s0",
      color: OFF_PALETTE,
    });

    expect(clip).toStrictEqual(expect.objectContaining(snapped));
  });

  it("refuses a move, ignores a param, and misses a param name in silence", async () => {
    const refusedMove = await entryFrom("ppal-update-clip", {
      path: "t0/s0",
      toPath: "t5/s3",
      name: "Moved",
    });

    expect(refusedMove.reason).toBe(
      `not moved: track ${await label("ppal-read-track", "t5")} is audio; a MIDI clip needs a MIDI track`,
    );

    const ignoredParam = await entryFrom("ppal-update-clip", {
      path: "t0/s0",
      name: "P",
      warpMode: "beats",
    });

    expect(ignoredParam.reason).toBe("warpMode ignored: the clip is MIDI");

    const unknownParam = await entryFrom("ppal-update-device", {
      path: "t0/d0",
      params: [{ name: "Nope", value: 1 }],
    });

    expect(unknownParam.params![0]!.reason).toBe(
      `not found on ${await label("ppal-read-device", "t0/d0")}`,
    );
  });

  it("refuses a param, a send and a device move on the target's own entry", async () => {
    // update-device's `params` list reports per param; gainDb and the other
    // chain-and-pad arguments have no entry of their own, so they ride on the
    // target's. The rack takes nothing else here, so its slot is a skip.
    const ignoredArg = await entriesFrom("ppal-update-device", {
      path: "t0/d0,t0/d0/pC1/c0",
      gainDb: -6,
    });

    expect(ignoredArg[0]).toStrictEqual({
      path: "t0/d0",
      ok: false,
      reason: "gainDb not applicable to RackDevice",
    });
    // The chain it was sent alongside takes it, and keeps its own slot.
    expect(ignoredArg[1]?.path).toBe("t0/d0/pC1/c0");

    // A rack's return chains belong to the rack, so the pad the call named is
    // what has nothing matching — its own entry says it.
    const padSend = await entryFrom("ppal-update-device", {
      path: "t0/d0/pC1",
      sends: [{ return: "Nope", gainDb: -10 }],
    });

    expect(padSend.sends).toStrictEqual([
      {
        return: "Nope",
        ok: false,
        reason: 'no return chain matching "Nope" (returns: a Saturator)',
      },
    ]);

    const rackLabel = await label("ppal-read-device", "t0/d0");
    const refusedCopy = await entriesFrom("ppal-duplicate", {
      type: "device",
      path: `t11/d0,t0/d0`,
    });

    expect(refusedCopy[1]).toStrictEqual({
      path: "t0/d0",
      ok: false,
      reason:
        `the copy of ${rackLabel} could not be moved to "t0/d1": ` +
        "the destination already has an instrument, and only one is allowed",
    });
  });

  it("says on the moved clip's entry that it replaced the one there", async () => {
    const moved = await entryFrom("ppal-update-clip", {
      path: "t0/s0",
      toPath: "t1/s0",
    });

    expect(moved.reason).toBe("overwrote the existing clip at t1/s0");
  });

  it("rounds a send, refuses one a track can't take, and skips an empty pad", async () => {
    const send = await entryFrom("ppal-update-track", {
      path: "t0",
      sends: [{ return: "A", gainDb: -12.345 }],
    });

    expect(sendsOf(send)[0]?.reason).toBe(
      "gainDb read back as shown, not as sent",
    );

    // The main track has no sends at all, so the write has nowhere to land.
    // The track's entry carries the refusal instead of the call warning and
    // leaving no entry.
    const mainSend = await entryFrom("ppal-update-track", {
      path: "mt",
      sends: [{ return: "A", gainDb: -10 }],
    });

    expect(sendsOf(mainSend)).toStrictEqual([
      expect.objectContaining({ ok: false, reason: "the track has no sends" }),
    ]);

    // Which return tracks exist is a fact about the Set, so it is resolved once
    // — and every track the call named still says it on its own entry.
    const noReturn = await entriesFrom("ppal-update-track", {
      path: `t0,${SCRATCH}`,
      sends: [{ return: "Nope", gainDb: -10 }],
    });

    for (const entry of noReturn) {
      expect(entry.sends).toStrictEqual([
        {
          return: "Nope",
          ok: false,
          reason:
            'no return track matching "Nope" (Available: A-Delay, B-Reverb)',
        },
      ]);
    }

    const pads = await entriesFrom("ppal-update-device", {
      path: "t0/d0/pC1,t0/d0/pC2",
      mute: true,
    });

    expect(pads[1]!.path).toBe("t0/d0/pC2");
    expect(pads[1]!.reason).toContain("has no chains");

    const nothingThere = await entryFrom("ppal-delete", {
      type: "device",
      path: `${SCRATCH}/inst`,
    });

    expect(nothingThere).toStrictEqual({
      path: `${SCRATCH}/inst`,
      reason: "nothing to delete",
    });
  });
});

/**
 * The warnings one call raised, whatever it answered with. Read off the raw
 * result so an error's warnings count too.
 * @param tool - The tool to call
 * @param args - The call's arguments
 * @returns The `WARNING:` lines, in the order they came back
 */
async function warningsFrom(
  tool: string,
  args: Record<string, unknown>,
): Promise<string[]> {
  const raised = getToolWarnings(
    await ctx.client!.callTool({ name: tool, arguments: args }),
  );

  await sleep(100);

  return raised;
}

/**
 * One call's single entry, asserted to have raised no warnings at all.
 * @param tool - The tool to call
 * @param args - The call's arguments
 * @returns The entry it answered with
 */
async function entryFrom(
  tool: string,
  args: Record<string, unknown>,
): Promise<TargetEntry> {
  const { data, warnings } = parseToolResultWithWarnings<TargetEntry>(
    await ctx.client!.callTool({ name: tool, arguments: args }),
  );

  expect(warnings).toStrictEqual([]);
  await sleep(100);

  return data;
}

/**
 * One call's entries, asserted to have raised no warnings at all.
 * @param tool - The tool to call
 * @param args - The call's arguments
 * @returns The entries it answered with
 */
async function entriesFrom(
  tool: string,
  args: Record<string, unknown>,
): Promise<TargetEntry[]> {
  const { data, warnings } = parseToolResultWithWarnings<TargetEntry[]>(
    await ctx.client!.callTool({ name: tool, arguments: args }),
  );

  expect(warnings).toStrictEqual([]);
  await sleep(100);

  return data;
}

/**
 * The sends one entry reports.
 * @param entry - The target's entry
 * @returns Its sends, or an empty list when it reported none
 */
function sendsOf(entry: TargetEntry): SendEntry[] {
  return entry.sends ?? [];
}

/**
 * How the warnings name an object: its path and the id Live gave it this run.
 * @param tool - The read tool that owns the object
 * @param path - Producer Pal path to it
 * @returns `<path> (id <id>)`
 */
async function label(tool: string, path: string): Promise<string> {
  return `${path} (id ${await readIdAtPath(ctx.client!, tool, path)})`;
}

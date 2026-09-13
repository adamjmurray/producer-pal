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

/** One entry of a multi-target write result. */
interface TargetEntry {
  id?: string;
  path?: string;
  ok?: false;
  reason?: string;
  params?: Array<{ reason?: string }>;
  sends?: Array<{ reason?: string }>;
}

describe("warnings the tools still raise", () => {
  it("says once per target that a colour snapped to the palette", async () => {
    expect(
      await warningsFrom("ppal-update-track", {
        path: `${SCRATCH},t10`,
        color: OFF_PALETTE,
      }),
    ).toStrictEqual([
      paletteWarning("track", await label("ppal-read-track", SCRATCH)),
      paletteWarning("track", await label("ppal-read-track", "t10")),
    ]);

    expect(
      await warningsFrom("ppal-update-scene", {
        path: "s3,s6",
        color: OFF_PALETTE,
      }),
    ).toStrictEqual([
      paletteWarning("scene", await label("ppal-read-scene", "s3")),
      paletteWarning("scene", await label("ppal-read-scene", "s6")),
    ]);

    expect(
      await warningsFrom("ppal-update-clip", {
        path: "t0/s0",
        color: OFF_PALETTE,
      }),
    ).toStrictEqual([
      paletteWarning("clip", await label("ppal-read-clip", "t0/s0")),
    ]);
  });

  it("says count was ignored by the types that copy once", async () => {
    expect(
      await warningsFrom("ppal-duplicate", {
        type: "device",
        path: "t2/d2",
        count: 2,
      }),
    ).toStrictEqual([
      "WARNING: count parameter ignored for device duplication (only single copy supported)",
    ]);

    expect(
      await warningsFrom("ppal-duplicate", {
        type: "chain",
        path: "t6/d0/c0",
        count: 2,
      }),
    ).toStrictEqual([
      "WARNING: count parameter ignored for chain duplication (only single copy supported)",
    ]);

    expect(
      await warningsFrom("ppal-duplicate", {
        type: "drum-pad",
        path: "t0/d0/pC1",
        toPath: "t0/d0/pC2",
        count: 2,
      }),
    ).toStrictEqual([
      "WARNING: count 2 ignored: a drum pad copy goes to the pads toPath names",
    ]);
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

  it("warns rather than reports when a target has no use for a param", async () => {
    // Not on the device's entry: update-device's `params` list reports per
    // param, but its chain-and-pad params still go back as a warning.
    expect(
      await warningsFrom("ppal-update-device", { path: "t0/d0", gainDb: -6 }),
    ).toStrictEqual([
      `WARNING: 'gainDb' not applicable to RackDevice ${await label("ppal-read-device", "t0/d0")}`,
    ]);
  });

  it("warns when a send names a return that isn't there", async () => {
    // One warning for the whole call: `sends` names return tracks, and which
    // ones exist is a fact about the Set rather than about either track.
    expect(
      await warningsFrom("ppal-update-track", {
        path: `t0,${SCRATCH}`,
        sends: [{ return: "Nope", gainDb: -10 }],
      }),
    ).toStrictEqual([
      'WARNING: sends entry "Nope" names no return track, so its gainDb was not written (Available: A-Delay, B-Reverb)',
    ]);

    // A rack's return chains belong to the rack, and this one still warns per
    // chain instead of reporting on the pad's entry.
    const chain = await label("ppal-read-device", "t0/d0/pC1/c0");

    expect(
      await warningsFrom("ppal-update-device", {
        path: "t0/d0/pC1",
        sends: [{ return: "Nope", gainDb: -10 }],
      }),
    ).toStrictEqual([
      `WARNING: chain "Kick Bass Drum 505 Classic" ${chain}: no return chain matching "Nope" (returns: a Saturator)`,
    ]);
  });

  it("warns about a copy and an overwrite the entry already reports", async () => {
    const rackLabel = await label("ppal-read-device", "t0/d0");

    expect(
      await warningsFrom("ppal-duplicate", {
        type: "device",
        path: `t11/d0,t0/d0`,
      }),
    ).toStrictEqual([
      `WARNING: Live refused the move of ${rackLabel}: the destination already has an instrument, and only one is allowed`,
    ]);

    const clipLabel = await label("ppal-read-clip", "t0/s0");

    expect(
      await warningsFrom("ppal-update-clip", {
        path: "t0/s0",
        toPath: "t1/s0",
      }),
    ).toStrictEqual([
      `WARNING: clip ${clipLabel} overwrote the existing clip at t1/s0`,
    ]);
  });
});

describe("calls that report on the entry and warn about nothing", () => {
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

  it("rounds a send, skips an empty pad, and finds nothing to delete", async () => {
    const send = await entryFrom("ppal-update-track", {
      path: "t0",
      sends: [{ return: "A", gainDb: -12.345 }],
    });

    expect(send.sends![0]!.reason).toBe(
      "gainDb read back as shown, not as sent",
    );

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
      type: "device",
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
 * The palette warning as a tool writes it.
 * @param noun - What kind of object was coloured
 * @param target - The object, as `<path> (id <id>)`
 * @returns The warning line to expect
 */
function paletteWarning(noun: string, target: string): string {
  return `WARNING: Requested ${noun} ${target} color ${OFF_PALETTE} was mapped to nearest palette color #3C3C3C. Live uses a fixed color palette.`;
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

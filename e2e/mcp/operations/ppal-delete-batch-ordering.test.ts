// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for batch delete ORDER. ppal-delete resolves every target up front,
 * then deletes in a loop — and sorts highest-index-first for tracks, scenes and
 * devices because those delete by position. Clips and chains are not sorted:
 * they delete by id, so an index shift should not reach them.
 *
 * "Should not" is the whole point of these tests. They list targets ASCENDING,
 * the worst case for a missing sort, and assert WHICH object survived rather
 * than just how many — a count passes even when the wrong ones died.
 *
 * Uses: e2e-test-set — t8 is the empty MIDI track.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-delete-batch-ordering
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  getToolWarnings,
  parseBatchResult,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import {
  createTrackWithDrumRack,
  type DrumPadInfo,
  readDrumPad,
} from "../device/drum/drum-pad-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";
import { arrangementStartOf } from "../clip/helpers/arrangement-start-test-helpers.ts";

const ctx = setupMcpTestContext();

interface DeleteResult {
  id: string;
  type: string;
  deleted: boolean;
}

interface ArrangementClipsResult {
  arrangementClips?: Array<{ id: string; path?: string }>;
}

describe("ppal-delete batch ordering", () => {
  it("deletes the clips it was given, not the ones that shifted into their place", async () => {
    // Four clips, one bar each, four bars apart so every start is distinct.
    const starts = ["1|1", "5|1", "9|1", "13|1"];
    const ids: string[] = [];

    for (const arrangementStart of starts) {
      const created = parseToolResult<CreateClipResult>(
        await ctx.client!.callTool({
          name: "ppal-create-clip",
          arguments: {
            path: `t${EMPTY_MIDI_TRACK}`,
            arrangementStart,
            notes: "C3 1|1",
            length: "4bar",
          },
        }),
      );

      ids.push(created.id);
      await sleep(100);
    }

    expect(new Set(ids).size).toBe(4);

    // Ascending: if anything here went by position, deleting index 0 would
    // shift the rest down and the later two deletes would hit the wrong clips.
    const deleted = parseBatchResult<DeleteResult>(
      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { id: ids.slice(0, 3).join(","), type: "clip" },
      }),
      3,
    );

    expect(deleted.map((d) => d.deleted)).toStrictEqual([true, true, true]);
    expect(deleted.map((d) => d.id)).toStrictEqual(ids.slice(0, 3));

    await sleep(150);

    // The survivor is identified by BOTH id and position: a wrong-clip delete
    // can leave the right count with the wrong clip standing.
    const remaining = await readArrangementClips();

    expect(remaining.map((c) => c.id)).toStrictEqual([ids[3]]);
    expect(arrangementStartOf(remaining[0])).toBe("13|1");
  });

  it("deletes the chains it was given, and leaves the survivor on its own pad", async () => {
    const rackPath = await createFourPadRack();

    // Deleting a chain parks it on a free pad and clears that pad, reading
    // in_note off the held object first. If a prior delete in this batch had
    // shifted the rack's chains under it, the recovery path would write an
    // in_note it read from the wrong chain — moving a pad nobody targeted.
    const result = await ctx.client!.callTool({
      name: "ppal-delete",
      arguments: {
        type: "chain",
        path: ["pC1", "pD1", "pE1"]
          .map((pad) => `${rackPath}/${pad}/c0`)
          .join(","),
      },
    });
    const deleted = parseBatchResult<DeleteResult>(result, 3);

    expect(deleted.map((d) => d.deleted)).toStrictEqual([true, true, true]);
    expect(getToolWarnings(result)).toStrictEqual([]);

    await sleep(250);

    for (const pad of ["C1", "D1", "E1"]) {
      expect(await padChainCount(rackPath, pad)).toBe(0);
    }

    // F1 was never named. It keeps its chain AND its note — the note is what
    // the corrupting path would overwrite.
    const survivor = await readDrumPad(ctx.client!, `${rackPath}/pF1`);

    expect(survivor.chains).toHaveLength(1);
    expect(survivor.pitch).toBe("F1");
  });
});

/**
 * A track holding a Drum Rack with four single-chain pads (C1, D1, E1, F1),
 * built by copying the stock C1 pad onto the two empty notes.
 * @returns The rack's path
 */
async function createFourPadRack(): Promise<string> {
  const { rackPath } = await createTrackWithDrumRack(ctx.client!);
  const source = (await readDrumPad(ctx.client!, `${rackPath}/pC1`)).id;

  for (const pad of ["pE1", "pF1"]) {
    await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "drum-pad", id: source, toPath: `${rackPath}/${pad}` },
    });
    await sleep(200);
  }

  return rackPath;
}

/**
 * How many chains a pad currently holds.
 * @param rackPath - Producer Pal path to the Drum Rack
 * @param pitch - The pad's note name (e.g. "C1")
 * @returns The chain count, 0 when the pad is empty
 */
async function padChainCount(rackPath: string, pitch: string): Promise<number> {
  const pad: DrumPadInfo = await readDrumPad(
    ctx.client!,
    `${rackPath}/p${pitch}`,
  );

  return pad.chains?.length ?? 0;
}

/** Read t8's arrangement clips, in Live's own order. */
async function readArrangementClips(): Promise<
  Array<{ id: string; path?: string }>
> {
  const track = parseToolResult<ArrangementClipsResult>(
    await ctx.client!.callTool({
      name: "ppal-read-track",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}`,
        include: ["arrangement-clips"],
      },
    }),
  );

  return track.arrangementClips ?? [];
}

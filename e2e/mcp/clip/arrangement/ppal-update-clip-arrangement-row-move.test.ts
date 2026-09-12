// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for moving a whole row of arrangement clips at once.
 *
 * A move clears its destination span before the copy lands, so shifting a row
 * later put every clip's destination on top of the next clip's current
 * position. Only real Live shows what that costs: the clips in between were
 * wiped before the loop reached them. The batch now runs the moves in an order
 * that clears nobody's way, and refuses a move nothing can clear for: a pair
 * trading places, or a clip the call sends nowhere at all.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track)
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-arrangement-row-move
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { arrangementClipAt } from "../helpers/clip-io-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** A clip result carrying the path the tool reported. */
interface MovedClip {
  id: string;
  path?: string;
}

describe("moving a row of arrangement clips", () => {
  it("keeps every clip when the row shifts four bars later", async () => {
    const row = await createRow(["201|1", "205|1", "209|1"], "Later");

    const { data, warnings } = await moveClips(
      row,
      ["205|1", "209|1", "213|1"].map(destination),
    );

    // In call order, so each entry still pairs with the id that asked for it.
    expect(data.map((clip) => clip.path)).toStrictEqual([
      destination("205|1"),
      destination("209|1"),
      destination("213|1"),
    ]);
    // The wiped middle clip used to come back as a bare id, warned about as a
    // session clip because the dead object read as one.
    expect(warnings.join(" ")).not.toContain("session clip");

    // All three survive, in the order they started in.
    await expectRowAt(["205|1", "209|1", "213|1"], data, "Later");

    expect(
      await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, "201|1"),
    ).toBeUndefined();
  });

  // arrangementLength runs after the move and clears the span it tiles across,
  // so it has to be part of the ordering too. It also broadcasts, so reading it
  // as "nothing is moving" switched the ordering off for the whole batch.
  it("keeps every clip when the row shift also sets a length", async () => {
    const row = await createRow(["501|1", "505|1", "509|1"], "Sized");

    const { data, warnings } = await moveClips(
      row,
      ["505|1", "509|1", "513|1"].map(destination),
      { arrangementLength: "4bar" },
    );

    expect(warnings.join(" ")).not.toContain("session clip");

    await expectRowAt(["505|1", "509|1", "513|1"], data, "Sized");

    expect(
      await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, "501|1"),
    ).toBeUndefined();
  });

  it("still shifts a row four bars earlier", async () => {
    const row = await createRow(["305|1", "309|1", "313|1"], "Earlier");

    const { data } = await moveClips(
      row,
      ["301|1", "305|1", "309|1"].map(destination),
    );

    await expectRowAt(["301|1", "305|1", "309|1"], data, "Earlier");

    expect(
      await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, "313|1"),
    ).toBeUndefined();
  });

  // Each clip's destination is the other's current position, so neither can go
  // first. Refusing both keeps the pair rather than losing one of them.
  it("refuses two clips trading positions and keeps both", async () => {
    const row = await createRow(["401|1", "405|1"], "Swap");
    const [first, second] = row as [CreateClipResult, CreateClipResult];

    const { warnings } = await moveClips(
      row,
      ["405|1", "401|1"].map(destination),
    );

    expect(warnings.join(" ")).toContain(
      `clip ${first.path} (id ${first.id}) was not moved: it would land on clip ` +
        `${second.path} (id ${second.id}), which this call can't move out of the way first`,
    );
    expect(warnings.join(" ")).toContain(
      `clip ${second.path} (id ${second.id}) was not moved: it would land on clip ` +
        `${first.path} (id ${first.id}), which this call can't move out of the way first`,
    );

    // Both still where they started, with the ids they started with.
    expect(
      (await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, "401|1"))?.id,
    ).toBe(first.id);
    expect(
      (await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, "405|1"))?.id,
    ).toBe(second.id);
  });

  // One destination for two clips leaves the second one with nowhere to go, so
  // it sits in the span the first one is moving into. The move used to run and
  // delete it, then report it as updated.
  it("refuses a move onto a clip the call sends nowhere, and keeps it", async () => {
    const [first, second] = (await createRow(["601|1", "605|1"], "Static")) as [
      CreateClipResult,
      CreateClipResult,
    ];

    const { warnings } = await moveClips(
      [second, first],
      [destination("601|1")],
    );

    expect(warnings.join(" ")).toContain(
      `clip ${second.path} (id ${second.id}) was not moved: it would land on clip ` +
        `${first.path} (id ${first.id}), which this call leaves where it is`,
    );

    // Both still where they started, with the ids they started with.
    expect(
      (await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, "601|1"))?.id,
    ).toBe(first.id);
    expect(
      (await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, "605|1"))?.id,
    ).toBe(second.id);
  });
});

/**
 * Check the row landed at these positions, in call order, names intact.
 * @param positions - Expected positions in bar|beat format, in call order
 * @param data - The move's results, in call order
 * @param namePrefix - The prefix the row was created with
 */
async function expectRowAt(
  positions: string[],
  data: MovedClip[],
  namePrefix: string,
): Promise<void> {
  for (const [index, position] of positions.entries()) {
    const placed = await arrangementClipAt(
      ctx.client!,
      EMPTY_MIDI_TRACK,
      position,
    );

    expect(placed?.id).toBe(data[index]?.id);
    expect(placed?.name).toBe(`${namePrefix} ${String(index)}`);
  }
}

/**
 * The clip path for a position on the scratch track.
 * @param position - Position in bar|beat format
 * @returns The path, e.g. `t8[205|1]`
 */
function destination(position: string): string {
  return `t${EMPTY_MIDI_TRACK}[${position}]`;
}

/**
 * Create a row of 4-bar arrangement clips, one per position.
 * @param positions - Positions in bar|beat format
 * @param namePrefix - Name prefix; each clip gets its index appended
 * @returns The created clips, in the order the positions were given
 */
async function createRow(
  positions: string[],
  namePrefix: string,
): Promise<CreateClipResult[]> {
  const clips: CreateClipResult[] = [];

  for (const [index, position] of positions.entries()) {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: destination(position),
        name: `${namePrefix} ${String(index)}`,
        notes: "C3 1|1",
        length: "4bar",
        looping: true,
      },
    });

    clips.push(parseToolResultWithWarnings<CreateClipResult>(result).data);
  }

  await sleep(200);

  return clips;
}

/**
 * Move a row of clips in one call.
 * @param row - The clips to move, in call order
 * @param toPaths - One destination per clip
 * @param extra - Further ppal-update-clip arguments
 * @returns The results in call order, and any warnings
 */
async function moveClips(
  row: CreateClipResult[],
  toPaths: string[],
  extra: Record<string, unknown> = {},
): Promise<{ data: MovedClip[]; warnings: string[] }> {
  const result = await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: {
      id: row.map((clip) => clip.id).join(","),
      toPath: toPaths.join(","),
      ...extra,
    },
  });

  await sleep(200);

  const { data, warnings } = parseToolResultWithWarnings<
    MovedClip | MovedClip[]
  >(result);

  return { data: Array.isArray(data) ? data : [data], warnings };
}

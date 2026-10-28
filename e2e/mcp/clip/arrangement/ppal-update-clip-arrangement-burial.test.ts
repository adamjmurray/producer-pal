// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for a batch move that destroys a clip the same call names.
 *
 * The destruction is correct — the move clears its destination range, and the
 * sibling was sitting in it — but the call used to report the casualty as if it
 * had been updated: the batch reached a dead object, read nothing off it, and
 * answered with why a session clip can't be moved. Only real Live shows that,
 * because a held object keeps its id and clears only its path.
 *
 * Both routes in: a take-lane destination, which never enters the move
 * ordering's dependency graph, and two clips sent to one main-lane spot.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track)
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-arrangement-burial
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  isToolError,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { arrangementClipAt } from "../helpers/clip-io-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

const TRACK = `t${EMPTY_MIDI_TRACK}`;

describe("a batch move that buries a clip the call names", () => {
  it("reports the take-lane clip a sibling was re-created on top of", async () => {
    const mover = await createClip(`${TRACK}/l0[601|1]`, "Mover", "1bar");
    const victim = await createClip(`${TRACK}/l0[605|1]`, "Victim", "1bar");

    const { data, warnings } = await updateClips(
      `${mover.id},${victim.id}`,
      // Both go to the victim's spot. The move ordering can't avoid a stack
      // the call asked for, so the mover lands first and the victim is gone
      // before its turn comes.
      { toPath: `${TRACK}/l0[605|1],${TRACK}/l0[605|1]` },
    );

    // Both land on one spot, so the mover's landing is pointless: it is left
    // unwritten, says what replaced it, and the clip is still where it was.
    expect(data[0]).toStrictEqual({
      id: mover.id,
      detail: `overwritten later in this call by ${TRACK}/l0[605|1]`,
    });
    expect(data[1]?.path).toBe(`${TRACK}/l0[605|1]`);
    expect(warnings).toStrictEqual([]);
    expect(await clipIsGone(mover.id)).toBe(false);
  });

  it("reports the main-lane clip a longer sibling landed on first", async () => {
    const long = await createClip(`${TRACK}[621|1]`, "Long", "8bar");
    const short = await createClip(`${TRACK}[629|1]`, "Short", "1bar");

    const { data, warnings } = await updateClips(`${long.id},${short.id}`, {
      toPath: "[629|1]",
    });

    // The long clip's landing cleared the short one before its turn, so there
    // was nothing left to move: a skip, not a delete.
    expect(data[1]).toStrictEqual({
      id: short.id,
      ok: false,
      detail: `not updated: the clip was overwritten earlier in this call by ${TRACK}[629|1]`,
    });
    expect(data[0]?.path).toBe(`${TRACK}[629|1]`);
    // Only one clip ever landed there, so nothing stacked.
    expect(warnings).toStrictEqual([]);

    expect(await clipIsGone(short.id)).toBe(true);

    // One clip on the spot, and it is the mover.
    const placed = await arrangementClipAt(
      ctx.client!,
      EMPTY_MIDI_TRACK,
      "629|1",
    );

    expect(placed?.id).toBe(data[0]?.id);
    expect(placed?.name).toBe("Long");
  });
});

/**
 * Create a MIDI clip at a path.
 * @param path - Where to create it
 * @param name - Clip name
 * @param length - Clip length
 * @returns The created clip
 */
async function createClip(
  path: string,
  name: string,
  length: string,
): Promise<CreateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: { path, name, length, notes: "C3 1|1" },
  });

  await sleep(100);

  return parseToolResultWithWarnings<CreateClipResult>(result).data;
}

/**
 * Update several clips at once.
 * @param id - Comma-separated clip ids
 * @param args - The rest of the ppal-update-clip arguments
 * @returns The entries and any warnings
 */
async function updateClips(
  id: string,
  args: Record<string, unknown>,
): Promise<{ data: ReadClipResult[]; warnings: string[] }> {
  const result = await ctx.client!.callTool({
    name: "ppal-update-clip",
    arguments: { id, ...args },
  });

  await sleep(100);

  return parseToolResultWithWarnings<ReadClipResult[]>(result);
}

/**
 * Whether an id names nothing any more.
 * @param id - The clip id to look up
 * @returns True when Live has no clip with that id
 */
async function clipIsGone(id: string): Promise<boolean> {
  const result = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { id },
  });

  return isToolError(result);
}

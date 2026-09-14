// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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

/** What a buried clip's entry says became of it. */
const BURIED = "not updated: another clip in this call was moved onto it";

describe("a batch move that buries a clip the call names", () => {
  it("reports the take-lane clip a sibling was re-created on top of", async () => {
    const mover = await createClip(`${TRACK}/l0[601|1]`, "Mover", "1bar");
    const victim = await createClip(`${TRACK}/l0[605|1]`, "Victim", "1bar");

    const { data, warnings } = await updateClips(
      `${mover.id},${victim.id}`,
      // The mover lands where the victim sits; the victim's own destination
      // never happens, because it is gone before its turn comes.
      { toPath: `${TRACK}/l0[605|1],${TRACK}/l0[609|1]` },
    );

    expect(data[1]).toStrictEqual({
      id: victim.id,
      path: `${TRACK}/l0[605|1]`,
      deleted: true,
      reason: BURIED,
    });
    expect(data[0]?.path).toBe(`${TRACK}/l0[605|1]`);
    expect(warnings).toStrictEqual([]);

    // The id the entry names really is dead.
    expect(await clipIsGone(victim.id)).toBe(true);
  });

  it("reports the main-lane clip a longer sibling landed on first", async () => {
    const long = await createClip(`${TRACK}[621|1]`, "Long", "8bar");
    const short = await createClip(`${TRACK}[629|1]`, "Short", "1bar");

    const { data, warnings } = await updateClips(`${long.id},${short.id}`, {
      toPath: "[629|1]",
    });

    expect(data[1]).toStrictEqual({
      id: short.id,
      path: `${TRACK}[629|1]`,
      deleted: true,
      reason: BURIED,
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

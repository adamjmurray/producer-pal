// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-create-clip's multi-destination result: N destinations
 * named, N entries back, in the order named, each saying what its own
 * destination got — including a slot whose clip the call replaced (ADR-0042).
 * Uses: e2e-test-set (t8 is empty, session and arrangement alike)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- clip/create/ppal-create-clip-entries
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  getToolWarnings,
  parseBatchResult,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** One destination's entry: the clip it got, or why it got none. */
interface ClipEntry {
  path?: string;
  ok?: false;
  reason?: string;
  id?: string;
}

/**
 * Read a clip's name back from Live.
 * @param id - The clip's id
 * @returns The name Live reports
 */
async function readClipName(id: string): Promise<string | undefined> {
  return parseToolResult<{ name?: string }>(
    await ctx.client!.callTool({ name: "ppal-read-clip", arguments: { id } }),
  ).name;
}

describe("ppal-create-clip result entries", () => {
  // A mixed list used to answer clip slots first and the arrangement after, so
  // the entries no longer lined up with the call and name/color landed on the
  // wrong clips.
  it("answers in the order path names the destinations", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}[601|1],t${EMPTY_MIDI_TRACK}/s0,t${EMPTY_MIDI_TRACK}[605|1]`,
        notes: "C3 1|1",
        name: "Arr A,Session,Arr B",
      },
    });
    const entries = parseBatchResult<CreateClipResult>(result, 3);

    expect(entries.map((entry) => entry.path)).toStrictEqual([
      `t${EMPTY_MIDI_TRACK}[601|1]`,
      `t${EMPTY_MIDI_TRACK}/s0`,
      `t${EMPTY_MIDI_TRACK}[605|1]`,
    ]);

    await sleep(100);

    // `name` pairs with the destination's place in the call, not with the view.
    const names = [];

    for (const entry of entries) {
      names.push(await readClipName(entry.id));
    }

    expect(names).toStrictEqual(["Arr A", "Session", "Arr B"]);
  });

  it("replaces the clip in an occupied slot and makes the rest", async () => {
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path: `t${EMPTY_MIDI_TRACK}/s0`, name: "Already here" },
    });
    await sleep(100);

    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s0,t${EMPTY_MIDI_TRACK}/s1`,
        name: "Replacing,Made",
      },
    });
    const entries = parseBatchResult<ClipEntry>(result, 2);

    expect(entries[0]?.path).toBe(`t${EMPTY_MIDI_TRACK}/s0`);
    expect(entries[0]?.ok).toBeUndefined();
    expect(entries[0]?.reason).toBe(
      `overwrote the existing clip at t${EMPTY_MIDI_TRACK}/s0`,
    );
    expect(entries[1]?.path).toBe(`t${EMPTY_MIDI_TRACK}/s1`);
    expect(entries[1]?.ok).toBeUndefined();

    await sleep(100);

    // Both slots hold the clips this call made.
    expect(await readClipName(entries[0]!.id!)).toBe("Replacing");
    expect(await readClipName(entries[1]!.id!)).toBe("Made");
  });

  // Writing into a slot replaces what is there, the way duplicating into one
  // does, and the new clip's entry is where that is reported.
  it("replaces the clip in the one slot it names", async () => {
    const first = parseToolResult<{ id: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: { path: `t${EMPTY_MIDI_TRACK}/s0`, notes: "C3 1|1" },
      }),
    );

    await sleep(100);

    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path: `t${EMPTY_MIDI_TRACK}/s0`, notes: "E3 1|1" },
    });
    const entry = parseToolResult<{ id: string; reason?: string }>(result);

    expect(entry.id).not.toBe(first.id);
    expect(entry.reason).toBe(
      `overwrote the existing clip at t${EMPTY_MIDI_TRACK}/s0`,
    );

    // The replacement is the entry's own news, so nothing rides in a warning.
    expect(getToolWarnings(result)).toHaveLength(0);

    await sleep(100);

    // The slot holds the new clip, notes and all.
    const slot = parseToolResult<{ id: string; notes?: string }>(
      await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { path: `t${EMPTY_MIDI_TRACK}/s0`, include: ["notes"] },
      }),
    );

    expect(slot.id).toBe(entry.id);
    expect(slot.notes).toContain("E3");
  });
});

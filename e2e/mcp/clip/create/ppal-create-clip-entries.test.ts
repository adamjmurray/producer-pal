// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-create-clip's multi-destination result: N destinations
 * named, N entries back, in the order named, and a destination that got no clip
 * holding its place as a skip (ADR-0042).
 * Uses: e2e-test-set (t8 is empty, session and arrangement alike)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- clip/create/ppal-create-clip-entries
 */
import { describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  getToolErrorMessage,
  getToolWarnings,
  isToolError,
  parseBatchResult,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** An entry for a destination that got no clip. */
interface SkipEntry {
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

  it("refuses an occupied clip slot in its own entry and makes the rest", async () => {
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path: `t${EMPTY_MIDI_TRACK}/s0`, name: "Already here" },
    });
    await sleep(100);

    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s0,t${EMPTY_MIDI_TRACK}/s1`,
        name: "Refused,Made",
      },
    });
    const entries = parseBatchResult<SkipEntry>(result, 2);

    expect(entries[0]).toStrictEqual({
      path: `t${EMPTY_MIDI_TRACK}/s0`,
      ok: false,
      reason: `a clip already exists at t${EMPTY_MIDI_TRACK}/s0`,
    });
    expect(entries[1]?.path).toBe(`t${EMPTY_MIDI_TRACK}/s1`);
    expect(entries[1]?.ok).toBeUndefined();

    // The refusal is the entry's, so nothing about it rides in a warning.
    expect(getToolWarnings(result)).not.toContainEqual(
      expect.stringContaining("already exists"),
    );

    await sleep(100);

    // The occupied slot kept the clip that was already there.
    expect(await readClipName(entries[1]!.id!)).toBe("Made");
  });

  // One destination has no list for an entry to hold a place in, so the reason
  // comes back as the error it would have been all along.
  it("errors when the one slot it names already holds a clip", async () => {
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path: `t${EMPTY_MIDI_TRACK}/s0` },
    });
    await sleep(100);

    const refused = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path: `t${EMPTY_MIDI_TRACK}/s0` },
    });

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain(
      `a clip already exists at t${EMPTY_MIDI_TRACK}/s0`,
    );
  });
});

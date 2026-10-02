// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-duplicate copying a clip over one that is already there:
 * into an occupied slot, and onto an arrangement clip.
 * Uses: e2e-test-set (t8 and t7 have no clips)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/operations/ppal-duplicate-clip-slot-overwrite.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK, RACKS_TRACK } from "../e2e-test-set.ts";
import { readClipsOnTrack } from "../clip/helpers/arrangement-lengthening-test-helpers.ts";

const ctx = setupMcpTestContext();

interface DuplicateClipResult {
  id: string;
  path?: string;
  detail?: string;
}

describe("ppal-duplicate into an occupied clip slot", () => {
  /**
   * Create one clip.
   * @param path - The slot it goes in
   * @param notes - Its notes, so a later read says which clip is there
   * @returns The new clip's id
   */
  async function createClip(path: string, notes: string): Promise<string> {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path, notes, length: "1bar" },
    });

    return parseToolResult<{ id: string }>(result).id;
  }

  // The copy destroys whatever the slot held. Live offers no other way to put
  // it there, so the copy still happens — but the entry has to say so, the way
  // update-clip's slot move does.
  it("says the copy replaced the clip that was in the slot", async () => {
    const sourceId = await createClip(
      `t${EMPTY_MIDI_TRACK}/s0`,
      "C3 D3 E3 F3 1|1",
    );
    const occupantId = await createClip(`t${RACKS_TRACK}/s0`, "C1 1|1");

    await sleep(100);

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: sourceId,
        toPath: `t${RACKS_TRACK}/s0`,
      },
    });
    const { data: copy, warnings } =
      parseToolResultWithWarnings<DuplicateClipResult>(result);

    expect(copy.path).toBe(`t${RACKS_TRACK}/s0`);
    expect(copy.detail).toBe(
      `overwrote the existing clip at t${RACKS_TRACK}/s0`,
    );
    expect(copy.id).not.toBe(occupantId);

    // What happened to a slot the call named belongs on that slot's entry.
    expect(warnings.join(" ")).not.toContain("overwrote");

    await sleep(100);

    // The copy is really there, and the clip that was is really gone.
    const readResult = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: `t${RACKS_TRACK}/s0`, include: ["notes"] },
    });
    const inSlot = parseToolResult<ReadClipResult>(readResult);

    expect(inSlot.id).toBe(copy.id);
    expect(inSlot.notes).toContain("C3");
  });
});

describe("ppal-duplicate onto an arrangement clip", () => {
  // A copy onto an arrangement clip replaces it, so transforms that can't be
  // read must refuse the call before any copy is made.
  it("refuses unreadable transforms before copying over a clip", async () => {
    const create = async (bar: number): Promise<string> => {
      const result = await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: {
          path: `t${EMPTY_MIDI_TRACK}[${bar}|1]`,
          notes: "C3 1|1",
          length: "1bar",
        },
      });

      return parseToolResult<{ id: string }>(result).id;
    };

    const sourceId = await create(71);

    await create(75);
    await sleep(200);

    const before = await readClipsOnTrack(ctx.client!, EMPTY_MIDI_TRACK);
    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "clip",
        id: sourceId,
        toPath: `t${EMPTY_MIDI_TRACK}[75|1]`,
        transforms: "velocity = = 1",
      },
    });

    expect(getToolErrorMessage(result)).toContain("transform syntax error");

    await sleep(200);

    const after = await readClipsOnTrack(ctx.client!, EMPTY_MIDI_TRACK);

    expect(after.clips).toStrictEqual(before.clips);
  });
});

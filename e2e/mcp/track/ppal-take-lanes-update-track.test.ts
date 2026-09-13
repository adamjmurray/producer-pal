// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for take lanes as ppal-update-track and ppal-read-track targets:
 * `t8/l+` appends a lane, `t8/l<n>` names one (creating the lanes up to it), a
 * lane path reads back as the lane rather than its track, and the id either
 * tool reports names that lane on both. The clip tools' side of take lanes is
 * in ppal-take-lanes.test.ts.
 *
 * Take lanes are append-only, so every test depends on setupMcpTestContext()
 * reopening the Live Set between tests to reset state (no `once`).
 *
 * Uses: e2e-test-set. t8 "9-MIDI" is an empty MIDI track, t9 "Parent" a group.
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- track/ppal-take-lanes-update-track
 */
import { describe, expect, it } from "vitest";
import { MAX_TAKE_LANES } from "#src/tools/constants.ts";
import {
  type CreateClipResult,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";
import { EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** A track read, for the take lane fields this suite checks. */
interface ReadTrackTakeLanesResult {
  takeLaneCount?: number;
}

/**
 * Create an arrangement clip on a take lane, tolerating any hint warning.
 * @param args - The ppal-create-clip arguments
 * @returns The created clip
 */
async function createOnLane(
  args: Record<string, unknown>,
): Promise<CreateClipResult> {
  return parseToolResultWithWarnings<CreateClipResult>(
    await ctx.client!.callTool({ name: "ppal-create-clip", arguments: args }),
  ).data;
}

/** A take lane as ppal-update-track reports it. */
interface UpdateTakeLaneResult {
  id: string;
  path: string;
  name: string;
  created?: true;
  ok?: false;
  reason?: string;
}

/**
 * Call ppal-update-track and parse the result.
 * @param args - The tool arguments
 * @returns The result, one entry per target named
 */
async function updateTrack<T>(args: Record<string, unknown>): Promise<T> {
  return parseToolResult<T>(
    await ctx.client!.callTool({ name: "ppal-update-track", arguments: args }),
  );
}

describe("take lanes as track-tool targets", () => {
  it("adds a lane with l+, names one by index, and reads the lane back", async () => {
    const added = await updateTrack<UpdateTakeLaneResult>({
      path: `t${EMPTY_MIDI_TRACK}/l+`,
      name: "Take A",
    });

    expect(added).toStrictEqual({
      id: expect.any(String),
      path: `t${EMPTY_MIDI_TRACK}/l0`,
      name: "Take A",
      created: true,
    });

    // Each l+ appends its own lane, and the names pair with them in order
    const more = await updateTrack<UpdateTakeLaneResult[]>({
      path: `t${EMPTY_MIDI_TRACK}/l+,t${EMPTY_MIDI_TRACK}/l+`,
      name: "Take B,Take C",
    });

    expect(more.map((lane) => lane.path)).toStrictEqual([
      `t${EMPTY_MIDI_TRACK}/l1`,
      `t${EMPTY_MIDI_TRACK}/l2`,
    ]);

    // Renaming an existing lane creates nothing
    const renamed = await updateTrack<UpdateTakeLaneResult>({
      path: `t${EMPTY_MIDI_TRACK}/l0`,
      name: "Renamed",
    });

    expect(renamed).toStrictEqual({
      id: added.id,
      path: `t${EMPTY_MIDI_TRACK}/l0`,
      name: "Renamed",
    });

    await sleep(100);
    const lane = parseToolResult<UpdateTakeLaneResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { path: `t${EMPTY_MIDI_TRACK}/l0` },
      }),
    );

    expect(lane).toStrictEqual({
      id: added.id,
      path: `t${EMPTY_MIDI_TRACK}/l0`,
      name: "Renamed",
    });
  });

  it("takes the id a lane read reported back as a target", async () => {
    await updateTrack<UpdateTakeLaneResult>({
      path: `t${EMPTY_MIDI_TRACK}/l+`,
      name: "Take A",
    });

    await sleep(100);
    const read = parseToolResult<UpdateTakeLaneResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { path: `t${EMPTY_MIDI_TRACK}/l0` },
      }),
    );

    // The id a read hands back names the lane on both tools
    const renamed = await updateTrack<UpdateTakeLaneResult>({
      id: read.id,
      name: "By id",
    });

    expect(renamed).toStrictEqual({
      id: read.id,
      path: `t${EMPTY_MIDI_TRACK}/l0`,
      name: "By id",
    });

    await sleep(100);
    const byId = parseToolResult<UpdateTakeLaneResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { id: read.id },
      }),
    );

    expect(byId).toStrictEqual({ ...read, name: "By id" });
  });

  it("reads a lane's clips with the arrangement-clips include", async () => {
    await createOnLane({
      path: `t${EMPTY_MIDI_TRACK}/l0[1|1]`,
      notes: "C3 1|1",
    });

    await sleep(100);
    const lane = parseToolResult<{ clips: Array<{ path: string }> }>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: {
          path: `t${EMPTY_MIDI_TRACK}/l0`,
          include: ["arrangement-clips"],
        },
      }),
    );

    expect(lane.clips.map((clip) => clip.path)).toStrictEqual([
      `t${EMPTY_MIDI_TRACK}/l0[1|1]`,
    ]);
  });

  it("creates the lanes up to an index and ignores the params a lane can't use", async () => {
    const lane = await updateTrack<UpdateTakeLaneResult>({
      path: `t${EMPTY_MIDI_TRACK}/l2`,
      name: "Third",
      color: "#FF0000",
    });

    expect(lane.path).toBe(`t${EMPTY_MIDI_TRACK}/l2`);
    expect(lane.created).toBe(true);
    expect(lane.reason).toBe("a take lane takes only name; ignored color");

    await sleep(100);
    const track = parseToolResult<ReadTrackTakeLanesResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { path: `t${EMPTY_MIDI_TRACK}` },
      }),
    );

    expect(track.takeLaneCount).toBe(3);
  });

  it("refuses the whole call when the lanes would pass the cap", async () => {
    const refused = await ctx.client!.callTool({
      name: "ppal-update-track",
      arguments: { path: `t${EMPTY_MIDI_TRACK}/l${MAX_TAKE_LANES}` },
    });

    expect(isToolError(refused)).toBe(true);
    expect(getToolErrorMessage(refused)).toContain(
      `take lane "l${MAX_TAKE_LANES}" is out of range: a track has "l0" through "l${MAX_TAKE_LANES - 1}"`,
    );
    expect(getToolErrorMessage(refused)).toContain("Nothing was created");

    // Nothing was created: a lane can't be deleted, so the refusal comes first
    await sleep(100);
    const track = parseToolResult<ReadTrackTakeLanesResult>(
      await ctx.client!.callTool({
        name: "ppal-read-track",
        arguments: { path: `t${EMPTY_MIDI_TRACK}` },
      }),
    );

    expect(track).not.toHaveProperty("takeLaneCount");
  });

  it("skips a lane path on a track that has no lanes", async () => {
    const result = await updateTrack<UpdateTakeLaneResult[]>({
      path: `rt0/l0,t9/l0,t${EMPTY_MIDI_TRACK}/l+`,
      name: "A,B,C",
    });

    expect(result[0]!.ok).toBe(false);
    expect(result[0]!.reason).toContain("only regular tracks have take lanes");
    expect(result[1]!.ok).toBe(false);
    expect(result[1]!.reason).toBe(
      'only regular tracks have take lanes; "t9" is a group track',
    );
    expect(result[2]).toStrictEqual({
      id: expect.any(String),
      path: `t${EMPTY_MIDI_TRACK}/l0`,
      name: "C",
      created: true,
    });
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for a cross-track arrangement clip duplicate.
 *
 * `toTrack` is the only cross-track destination for an arrangement clip. The
 * device-only `toPath` and the session-only `toSlot` used to be dropped without
 * a word, degrading the call to "duplicate onto my own track at
 * arrangementStart" — which overwrites the source when the position matches. So
 * these pin both halves: `toTrack` really copies, and the wrong param is
 * refused instead of quietly eating the source.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track, t7 = MIDI track with no clips)
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-cross-track
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  resetConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

const SOURCE_TRACK = 8;
const DEST_TRACK = 7;
const AUDIO_TRACK = 5;

describe("cross-track arrangement clip duplicate", () => {
  beforeAll(async () => {
    await resetConfig();
    await sleep(50);
  });

  it("copies to toTrack at the source's own position, leaving the source intact", async () => {
    const position = "5|1";
    const source = await createArrClip(position, "Source A");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      arrangementStart: position,
      toTrack: DEST_TRACK,
      name: "Cross Copy A",
    });
    const copy = parseToolResult<{ id: string; trackIndex?: number }>(result);

    // The copy is a new clip on the destination track...
    expect(copy.id).not.toBe(source.id);

    const placed = await clipAt(DEST_TRACK, position);

    expect(placed?.id).toBe(copy.id);
    expect(placed?.name).toBe("Cross Copy A");
    expect(placed?.notes).toContain("C3");

    // ...and the source is untouched: same id, same name, same track.
    const survivor = await clipAt(SOURCE_TRACK, position);

    expect(survivor?.id).toBe(source.id);
    expect(survivor?.name).toBe("Source A");
  });

  it("rejects toPath instead of dropping it and overwriting the source", async () => {
    const position = "13|1";
    const source = await createArrClip(position, "Source B");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      arrangementStart: position,
      toPath: `t${DEST_TRACK}`,
      name: "Cross Copy B",
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain("toPath is for devices");

    const survivor = await clipAt(SOURCE_TRACK, position);

    expect(survivor?.id).toBe(source.id);
    expect(survivor?.name).toBe("Source B");
  });

  it("rejects toSlot on an arrangement destination", async () => {
    const position = "21|1";
    const source = await createArrClip(position, "Source C");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      arrangementStart: position,
      toSlot: `${DEST_TRACK}/0`,
      name: "Cross Copy C",
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "toSlot is for session destinations",
    );

    const survivor = await clipAt(SOURCE_TRACK, position);

    expect(survivor?.id).toBe(source.id);
    expect(survivor?.name).toBe("Source C");
  });

  it("refuses a MIDI clip aimed at an audio track rather than silently no-opping", async () => {
    const position = "29|1";
    const source = await createArrClip(position, "Source D");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      arrangementStart: position,
      toTrack: AUDIO_TRACK,
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `MIDI clip cannot be duplicated to audio track ${AUDIO_TRACK}`,
    );
    expect(await clipAt(AUDIO_TRACK, position)).toBeUndefined();
  });
});

/**
 * Call an MCP tool with the given arguments.
 * @param name - Tool name (e.g. "ppal-duplicate")
 * @param args - Tool arguments
 * @returns Raw tool result
 */
async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await ctx.client!.callTool({ name, arguments: args });

  await sleep(100);

  return result;
}

/**
 * Create a named MIDI clip in the source track's arrangement.
 * @param arrangementStart - Position in bar|beat format
 * @param name - Clip name
 * @returns The created clip's metadata
 */
async function createArrClip(
  arrangementStart: string,
  name: string,
): Promise<{ id: string }> {
  const result = await callTool("ppal-create-clip", {
    trackIndex: SOURCE_TRACK,
    arrangementStart,
    name,
    notes: "C3 D3 E3 F3 1|1",
    length: "1bar",
  });

  return parseToolResult<{ id: string }>(result);
}

/**
 * Read the arrangement clip at an exact position on a track. Tolerates warnings
 * so a fix that warns about the dropped destination still reads back cleanly.
 * @param trackIndex - Track index
 * @param arrangementStart - Position in bar|beat format
 * @returns The clip at that position, if any
 */
async function clipAt(
  trackIndex: number,
  arrangementStart: string,
): Promise<ReadClipResult | undefined> {
  const result = await callTool("ppal-read-track", {
    trackIndex,
    include: ["arrangement-clips", "notes"],
  });
  const { data } = parseToolResultWithWarnings<{
    arrangementClips?: ReadClipResult[];
  }>(result);

  return data.arrangementClips?.find(
    (clip) => clip.arrangementStart === arrangementStart,
  );
}

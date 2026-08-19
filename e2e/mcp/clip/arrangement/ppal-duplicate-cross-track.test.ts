// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for a cross-track arrangement clip duplicate.
 *
 * `toPath` names the destination track. A destination that isn't honored
 * degrades the call to "duplicate onto my own track at arrangementStart", which
 * overwrites the source when the position matches — so these pin both halves:
 * `toPath` really copies, and anything ambiguous or wrong is refused instead of
 * quietly eating the source.
 *
 * `toPath` and `arrangementStart` are both lists, and the shorter one cycles.
 * That count only shows up against real Live — the copies have to land on the
 * tracks and beats we claim — so the fan-out cases live here rather than in unit
 * tests.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track; t7, t10 = MIDI tracks with no
 * clips; t5 = audio track)
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-cross-track
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

const SOURCE_TRACK = 8;
const DEST_TRACK = 7;
const DEST_TRACK_2 = 10;
const AUDIO_TRACK = 5;

describe("cross-track arrangement clip duplicate", () => {
  it("copies to toPath's track at the source's own position, leaving the source intact", async () => {
    const position = "5|1";
    const source = await createArrClip(position, "Source A");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      arrangementStart: position,
      toPath: `t${DEST_TRACK}`,
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

  it("refuses a bare track with no position instead of guessing which one", async () => {
    const position = "13|1";
    const source = await createArrClip(position, "Source B");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      toPath: `t${DEST_TRACK}`,
      name: "Cross Copy B",
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `"t${DEST_TRACK}" names a track but not a spot on it`,
    );

    const survivor = await clipAt(SOURCE_TRACK, position);

    expect(survivor?.id).toBe(source.id);
    expect(survivor?.name).toBe("Source B");
  });

  it("rejects the deprecated toSlot on an arrangement destination", async () => {
    const position = "21|1";
    const source = await createArrClip(position, "Source C");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      arrangementStart: position,
      toSlot: `${DEST_TRACK}/0`,
      name: "Cross Copy C",
    });

    // toSlot only ever named session slots, so it wins over arrangementStart —
    // and then has nowhere to put an arrangement clip.
    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "cannot duplicate arrangement clips to the session",
    );

    const survivor = await clipAt(SOURCE_TRACK, position);

    expect(survivor?.id).toBe(source.id);
    expect(survivor?.name).toBe("Source C");
  });

  // Skipped, not fatal: one bad entry in a comma-separated toPath must not cost
  // the good ones.
  it("skips a MIDI clip aimed at an audio track rather than silently no-opping", async () => {
    const position = "29|1";
    const source = await createArrClip(position, "Source D");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      arrangementStart: position,
      toPath: `t${AUDIO_TRACK}`,
    });
    const { data, warnings } = parseToolResultWithWarnings<unknown[]>(result);

    expect(data).toStrictEqual([]);
    expect(warnings.join(" ")).toContain(
      `MIDI clip cannot be duplicated to audio track ${AUDIO_TRACK}`,
    );
    expect(await clipAt(AUDIO_TRACK, position)).toBeUndefined();
  });

  it("fans one position out across every track in toPath", async () => {
    const position = "37|1";
    const source = await createArrClip(position, "Source E");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      arrangementStart: position,
      toPath: `t${DEST_TRACK},t${DEST_TRACK_2}`,
      name: "Fan Out",
    });
    const copies = parseToolResult<Array<{ id: string }>>(result);

    expect(copies).toHaveLength(2);

    // One copy per track, at the single position we gave.
    const first = await clipAt(DEST_TRACK, position);
    const second = await clipAt(DEST_TRACK_2, position);

    expect(first?.id).toBe(copies[0]!.id);
    expect(second?.id).toBe(copies[1]!.id);
    expect(first?.name).toBe("Fan Out");
    expect(second?.name).toBe("Fan Out");
    expect(second?.notes).toContain("C3");

    const survivor = await clipAt(SOURCE_TRACK, position);

    expect(survivor?.id).toBe(source.id);
  });

  it("cycles one toPath track across every arrangementStart", async () => {
    const source = await createArrClip("45|1", "Source F");
    const positions = ["49|1", "53|1", "57|1"];

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      arrangementStart: positions.join(", "),
      toPath: `t${DEST_TRACK_2}`,
      name: "Cycled",
    });
    const copies = parseToolResult<Array<{ id: string }>>(result);

    expect(copies).toHaveLength(3);

    for (const [i, position] of positions.entries()) {
      const placed = await clipAt(DEST_TRACK_2, position);

      expect(placed?.id).toBe(copies[i]!.id);
      expect(placed?.name).toBe("Cycled");
    }

    // All three went to the named track, not the source's.
    expect(await clipAt(SOURCE_TRACK, "49|1")).toBeUndefined();
  });

  it("honors the old bare track index and says what to write instead", async () => {
    const source = await createArrClip("61|1", "Source G");
    const position = "65|1";

    const { data: copy, warnings } = parseToolResultWithWarnings<{
      id: string;
      path?: string;
    }>(
      await callTool("ppal-duplicate", {
        type: "clip",
        id: source.id,
        arrangementStart: position,
        toPath: `${DEST_TRACK}`,
      }),
    );

    expect(warnings.join(" ")).toContain(
      `toPath "${DEST_TRACK}" is a bare track index; use "t${DEST_TRACK}"`,
    );

    // Honored, not just tolerated: the copy is on the track the old spelling
    // named, and the result reports it the way the warning asks for.
    expect(copy.path).toBe(`t${DEST_TRACK}`);
    expect((await clipAt(DEST_TRACK, position))?.id).toBe(copy.id);
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
    path: `t${SOURCE_TRACK}`,
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

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for a cross-track arrangement clip duplicate.
 *
 * `toPath` names the destination: a track, a position, or both. A destination
 * that isn't honored degrades the call to "copy onto my own track at that
 * position", which overwrites the source when the position matches — so these
 * pin both halves: `toPath` really copies, and anything ambiguous or wrong is
 * refused instead of quietly eating the source.
 *
 * `toPath` is a list. That count only shows up against real Live — the copies
 * have to land on the tracks and beats we claim — so the fan-out cases live
 * here rather than in unit tests.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track; t7, t10 = MIDI tracks with no
 * clips; t5 = audio track)
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-cross-track
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  getToolErrorMessage,
  isToolError,
  type ReadClipResult,
  setupMcpTestContext,
  type SkippedTargetResult,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  AUDIO_TRACK,
  CHILD_TRACK,
  EMPTY_MIDI_TRACK,
  RACKS_TRACK,
} from "../../e2e-test-set.ts";
import { arrangementStartOf } from "../helpers/arrangement-start-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

describe("cross-track arrangement clip duplicate", () => {
  it("copies to toPath's track at the source's own position, leaving the source intact", async () => {
    const position = "5|1";
    const source = await createArrClip(position, "Source A");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      toPath: `t${RACKS_TRACK}[${position}]`,
      name: "Cross Copy A",
    });
    const copy = parseToolResult<{ id: string }>(result);

    // The copy is a new clip on the destination track...
    expect(copy.id).not.toBe(source.id);

    const placed = await clipAt(RACKS_TRACK, position);

    expect(placed?.id).toBe(copy.id);
    expect(placed?.name).toBe("Cross Copy A");
    expect(placed?.notes).toContain("C3");

    // ...and the source is untouched: same id, same name, same track.
    const survivor = await clipAt(EMPTY_MIDI_TRACK, position);

    expect(survivor?.id).toBe(source.id);
    expect(survivor?.name).toBe("Source A");
  });

  it("refuses a bare track with no position instead of guessing which one", async () => {
    const position = "13|1";
    const source = await createArrClip(position, "Source B");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      toPath: `t${RACKS_TRACK}`,
      name: "Cross Copy B",
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `"t${RACKS_TRACK}" names a track but not a spot on it`,
    );

    const survivor = await clipAt(EMPTY_MIDI_TRACK, position);

    expect(survivor?.id).toBe(source.id);
    expect(survivor?.name).toBe("Source B");
  });

  it("lets the deprecated toSlot win over arrangementStart", async () => {
    const position = "21|1";
    const source = await createArrClip(position, "Source C");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      arrangementStart: position,
      toSlot: `${RACKS_TRACK}/0`,
      name: "Cross Copy C",
    });

    // toSlot only ever named clip slots, so arrangementStart is dropped and the
    // arrangement clip is re-created in that slot.
    const { data: copy, warnings } = parseToolResultWithWarnings<{
      id: string;
      detail?: string;
    }>(result);

    expect(warnings.join("\n")).toContain("arrangementStart ignored");
    expect(copy.id).not.toBe(source.id);
    expect(copy.detail).toContain("re-created from the arrangement clip");

    const survivor = await clipAt(EMPTY_MIDI_TRACK, position);

    expect(survivor?.id).toBe(source.id);
    expect(survivor?.name).toBe("Source C");
  });

  // One destination, and it can't take the clip: nothing was made, so the reason
  // comes back as the error rather than an entry with no list to sit in.
  it("refuses a MIDI clip aimed at an audio track rather than silently no-opping", async () => {
    const position = "29|1";
    const source = await createArrClip(position, "Source D");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      toPath: `t${AUDIO_TRACK}[${position}]`,
    });

    expect(isToolError(result)).toBe(true);
    // The destination's id is Live-assigned, so match around it.
    expect(getToolErrorMessage(result)).toMatch(
      new RegExp(
        `track t${AUDIO_TRACK} \\(id \\d+\\) is audio; a MIDI clip needs a MIDI track`,
      ),
    );
    expect(await clipAt(AUDIO_TRACK, position)).toBeUndefined();
  });

  // Two destinations, one of them refused: the refusal keeps its slot, so the
  // entries pair against the toPath the call sent.
  it("keeps the slot of a destination that can't take the copy", async () => {
    const position = "33|1";
    const source = await createArrClip(position, "Source D2");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      toPath: `t${RACKS_TRACK}[${position}],t${AUDIO_TRACK}[${position}]`,
    });
    const { data, warnings } =
      parseToolResultWithWarnings<Array<ReadClipResult | SkippedTargetResult>>(
        result,
      );
    const [landed, refused] = data as [ReadClipResult, SkippedTargetResult];

    expect(data).toHaveLength(2);
    expect(landed.path).toBe(`t${RACKS_TRACK}[${position}]`);
    expect(refused).toStrictEqual({
      path: `t${AUDIO_TRACK}[${position}]`,
      ok: false,
      detail: expect.stringContaining(
        "is audio; a MIDI clip needs a MIDI track",
      ),
    });
    expect(warnings.join(" ")).not.toContain("not duplicated");
    expect(await clipAt(AUDIO_TRACK, position)).toBeUndefined();
  });

  it("fans one position out across every track in toPath", async () => {
    const position = "37|1";
    const source = await createArrClip(position, "Source E");

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      toPath: `t${RACKS_TRACK}[${position}],t${CHILD_TRACK}[${position}]`,
      name: "Fan Out",
    });
    const copies = parseToolResult<Array<{ id: string }>>(result);

    expect(copies).toHaveLength(2);

    // One copy per track, at the single position we gave.
    const first = await clipAt(RACKS_TRACK, position);
    const second = await clipAt(CHILD_TRACK, position);

    expect(first?.id).toBe(copies[0]!.id);
    expect(second?.id).toBe(copies[1]!.id);
    expect(first?.name).toBe("Fan Out");
    expect(second?.name).toBe("Fan Out");
    expect(second?.notes).toContain("C3");

    const survivor = await clipAt(EMPTY_MIDI_TRACK, position);

    expect(survivor?.id).toBe(source.id);
  });

  it("sends one toPath track a position apiece", async () => {
    const source = await createArrClip("45|1", "Source F");
    const positions = ["49|1", "53|1", "57|1"];

    const result = await callTool("ppal-duplicate", {
      type: "clip",
      id: source.id,
      toPath: positions.map((at) => `t${CHILD_TRACK}[${at}]`).join(", "),
      name: "Cycled",
    });
    const copies = parseToolResult<Array<{ id: string }>>(result);

    expect(copies).toHaveLength(3);

    for (const [i, position] of positions.entries()) {
      const placed = await clipAt(CHILD_TRACK, position);

      expect(placed?.id).toBe(copies[i]!.id);
      expect(placed?.name).toBe("Cycled");
    }

    // All three went to the named track, not the source's.
    expect(await clipAt(EMPTY_MIDI_TRACK, "49|1")).toBeUndefined();
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
        toPath: `${RACKS_TRACK}[${position}]`,
      }),
    );

    expect(warnings.join(" ")).toContain(
      `toPath "${RACKS_TRACK}" is a bare track index; use "t${RACKS_TRACK}"`,
    );

    // Honored, not just tolerated: the copy is on the track the old spelling
    // named, and the result reports it the way the warning asks for.
    expect(copy.path).toBe(`t${RACKS_TRACK}[${position}]`);
    expect((await clipAt(RACKS_TRACK, position))?.id).toBe(copy.id);
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
 * @param position - Position in bar|beat format
 * @param name - Clip name
 * @returns The created clip's metadata
 */
async function createArrClip(
  position: string,
  name: string,
): Promise<{ id: string }> {
  const result = await callTool("ppal-create-clip", {
    path: `t${EMPTY_MIDI_TRACK}[${position}]`,
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
 * @param position - Position in bar|beat format
 * @returns The clip at that position, if any
 */
async function clipAt(
  trackIndex: number,
  position: string,
): Promise<ReadClipResult | undefined> {
  const result = await callTool("ppal-read-track", {
    trackIndex,
    include: ["arrangement-clips", "notes"],
  });
  const { data } = parseToolResultWithWarnings<{
    arrangementClips?: ReadClipResult[];
  }>(result);

  return data.arrangementClips?.find(
    (clip) => arrangementStartOf(clip) === position,
  );
}

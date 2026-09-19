// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for refusing a single track-qualified toPath shared by several
 * clips. A lane or slot names one place, so it can't pair with more than one
 * id - and it used to pair silently wrong instead of refusing.
 *
 * Uses: e2e-test-set - t8 is the empty MIDI track for dynamic clip creation.
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-shared-destination
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** t1 "Bass": no arrangement clips, so a second track for fan-out. */
const BASS_TRACK = 1;

/**
 * Create an arrangement clip and return its ID.
 * @param position - Bar|beat position
 * @returns Clip ID
 */
async function createArrangementClip(
  position: string,
  track = EMPTY_MIDI_TRACK,
): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      path: `t${track}[${position}]`,
      notes: "C3 1|1",
      length: "1bar",
    },
  });

  return parseToolResult<{ id: string }>(result).id;
}

describe("ppal-update-clip refuses a shared destination", () => {
  it("refuses one arrangement spot for two clip ids, and moves neither", async () => {
    const id1 = await createArrangementClip("401|1");
    const id2 = await createArrangementClip("405|1");

    await sleep(200);

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: `${id1},${id2}`, toPath: `t${EMPTY_MIDI_TRACK}[420|1]` },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      "2 clips can't share one spot",
    );

    await sleep(200);

    const read1 = parseToolResult<{ path: string }>(
      await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { id: id1 },
      }),
    );
    const read2 = parseToolResult<{ path: string }>(
      await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { id: id2 },
      }),
    );

    expect(read1.path).toBe(`t${EMPTY_MIDI_TRACK}[401|1]`);
    expect(read2.path).toBe(`t${EMPTY_MIDI_TRACK}[405|1]`);
  });

  it("refuses one session slot for two clip ids", async () => {
    const id1 = await createArrangementClip("451|1");
    const id2 = await createArrangementClip("455|1");

    await sleep(200);

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: `${id1},${id2}`, toPath: `t${EMPTY_MIDI_TRACK}/s5` },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      "2 clips can't share one slot",
    );
  });

  // The bare form still fans out: each clip keeps its own track and moves to
  // the same position. Two tracks, so the shared position can't collide.
  // Fuller fan-out coverage lives in ppal-update-clip-arrangement-multistart.
  it("still fans out a bare position across both clips", async () => {
    const id1 = await createArrangementClip("501|1");
    const id2 = await createArrangementClip("505|1", BASS_TRACK);

    await sleep(200);

    const { data: moved } = parseToolResultWithWarnings<{ path: string }[]>(
      await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: { id: `${id1},${id2}`, toPath: "[520|1]" },
      }),
    );

    expect(moved.map((clip) => clip.path)).toStrictEqual([
      `t${EMPTY_MIDI_TRACK}[520|1]`,
      `t${BASS_TRACK}[520|1]`,
    ]);
  });
});

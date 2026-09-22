// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * timeSignature, start, length, firstStart and the booleans pair 1:1 with the
 * clips the call names, the way name and color do.
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-value-pairing
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import { createClipInSlot } from "../helpers/ppal-clip-transforms-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

describe("ppal-update-clip per-clip values", () => {
  /** Read each clip back, in the order the ids were given. */
  async function readClips(ids: string[]): Promise<ReadClipResult[]> {
    await sleep(100);

    const clips: ReadClipResult[] = [];

    for (const id of ids) {
      clips.push(
        parseToolResult<ReadClipResult>(
          await ctx.client!.callTool({
            name: "ppal-read-clip",
            arguments: { id, include: ["timing"] },
          }),
        ),
      );
    }

    return clips;
  }

  it("gives each clip its own length in one call", async () => {
    const ids = [
      await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s0`, {
        notes: "C3 1|1",
      }),
      await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s1`, {
        notes: "E3 1|1",
      }),
    ];

    // start broadcasts to both clips while length pairs with them.
    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: ids.join(","), start: "1|1", length: "2bar,4bar" },
    });

    const clips = await readClips(ids);

    expect(clips.map((clip) => clip.length)).toStrictEqual(["2bar", "4bar"]);
  });

  it("gives each clip its own time signature in one call", async () => {
    const ids = [
      await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s2`, {
        notes: "C3 1|1",
      }),
      await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s3`, {
        notes: "E3 1|1",
      }),
    ];

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: ids.join(","), timeSignature: "5/4,7/8" },
    });

    const clips = await readClips(ids);

    expect(clips.map((clip) => clip.timeSignature)).toStrictEqual([
      "5/4",
      "7/8",
    ]);
  });

  it("gives each clip its own looping in one call", async () => {
    const ids = [
      await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s4`, {
        notes: "C3 1|1",
      }),
      await createClipInSlot(ctx, `t${EMPTY_MIDI_TRACK}/s5`, {
        notes: "E3 1|1",
      }),
    ];

    await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: ids.join(","), looping: "true,false" },
    });

    const clips = await readClips(ids);

    expect(clips.map((clip) => clip.looping)).toStrictEqual([true, false]);
  });
});

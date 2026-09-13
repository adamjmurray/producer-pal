// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for arrangement address resolution: `t0[5|1]` names the clip
 * COVERING that position, not only one starting there.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track)
 *
 * Run with: npm run e2e:mcp -- ppal-arrangement-address-containment
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResultWithWarnings,
  type CreateClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { readClipFully, updateClip } from "../helpers/clip-io-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext({ once: true });

describe("arrangement address resolves to the covering clip", () => {
  it("read-clip finds a 4-bar clip from a mid-clip position", async () => {
    const clip = await createClip("1|1", "Covers Bar 3", "4bar");

    const found = await readClipFully(ctx.client!, {
      path: `t${EMPTY_MIDI_TRACK}[3|1]`,
    });

    expect(found.id).toBe(clip.id);
    // Spelling stays the clip's own start, not the position it was asked by.
    expect(found.path).toBe(`t${EMPTY_MIDI_TRACK}[1|1]`);
  });

  it("update-clip addresses a clip by a mid-clip position", async () => {
    const clip = await createClip("9|1", "Renamed Via Mid Position", "4bar");

    const { data: updated } = await updateClip(ctx.client!, null, {
      path: `t${EMPTY_MIDI_TRACK}[11|1]`,
      name: "Renamed",
    });

    expect(updated.id).toBe(clip.id);
    // A write result doesn't echo a value that landed as asked; read it back.
    const after = await readClipFully(ctx.client!, { id: clip.id });

    expect(after.name).toBe("Renamed");
  });

  it("resolves the boundary between two clips to the one starting there", async () => {
    // Two back-to-back 4-bar clips: first spans 17|1-21|1, second 21|1-25|1.
    const first = await createClip("17|1", "Before Boundary", "4bar");
    const second = await createClip("21|1", "After Boundary", "4bar");

    const atBoundary = await readClipFully(ctx.client!, {
      path: `t${EMPTY_MIDI_TRACK}[21|1]`,
    });

    expect(atBoundary.id).toBe(second.id);
    expect(atBoundary.id).not.toBe(first.id);
  });

  it("finds a take-lane clip from a mid-clip position", async () => {
    const clip = await createClip("29|1", "On A Lane", "4bar", "/l0");

    const found = await readClipFully(ctx.client!, {
      path: `t${EMPTY_MIDI_TRACK}/l0[31|1]`,
    });

    expect(found.id).toBe(clip.id);
    expect(found.path).toBe(`t${EMPTY_MIDI_TRACK}/l0[29|1]`);
  });
});

/**
 * Create a MIDI arrangement clip on the scratch track.
 * @param position - Where the clip starts
 * @param name - The clip's name
 * @param length - The clip's length (e.g. "4bar")
 * @param laneSuffix - Path suffix naming a take lane (e.g. "/l0")
 * @returns The created clip
 */
async function createClip(
  position: string,
  name: string,
  length: string,
  laneSuffix = "",
): Promise<CreateClipResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-clip",
    arguments: {
      path: `t${EMPTY_MIDI_TRACK}${laneSuffix}[${position}]`,
      name,
      notes: "C3 D3 E3 F3 1|1",
      length,
    },
  });

  await sleep(100);

  // Warnings are tolerated: creating on a take lane always warns that the
  // lane is hidden until the track's arrow is expanded.
  return parseToolResultWithWarnings<CreateClipResult>(result).data;
}

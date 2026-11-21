// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for create-clip saying when Live cut notes short. Live cuts the
 * earlier of two overlapping same-pitch notes at the later one's start, and the
 * entry's `detail` counts those notes. In 6/8 a bar|beat beat is an eighth, so
 * `n/4 C1 1|1,2,3` is a quarter note every eighth: the first two are cut.
 *
 * Uses: e2e-test-set (t8 = empty MIDI track)
 *
 * Run with: npm run e2e:mcp -- clip/create/ppal-create-clip-same-pitch-overlap
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  type CreateClipResult,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import { readNoteDicts } from "../helpers/clip-io-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true });

beforeEach(async () => {
  await setConfig({ liveApiEnabled: true });
});

/**
 * Create a clip in a slot of the empty MIDI track.
 * @param scene - The scene (slot) index
 * @param args - The rest of the create-clip arguments
 * @returns The create result
 */
async function createInSlot(
  scene: number,
  args: Record<string, unknown>,
): Promise<CreateClipResult> {
  const created = parseToolResult<CreateClipResult>(
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path: `t${EMPTY_MIDI_TRACK}/s${scene}`, ...args },
    }),
  );

  await sleep(100);

  return created;
}

describe("ppal-create-clip same-pitch overlap", () => {
  it("counts the notes Live cut short in 6/8", async () => {
    const created = await createInSlot(0, {
      timeSignature: "6/8",
      notes: "n/4 C1 1|1,2,3",
    });

    expect(created.detail).toBe(
      "2 notes shortened by the next note at the same pitch",
    );

    const durations = (await readNoteDicts(ctx.client!, created.id))
      .toSorted((a, b) => a.start_time! - b.start_time!)
      .map((note) => note.duration);

    expect(durations).toStrictEqual([0.5, 0.5, 1]);
  });

  it("says nothing when the notes don't overlap", async () => {
    const created = await createInSlot(1, {
      timeSignature: "6/8",
      notes: "n/8 C1 1|1,2,3",
    });

    expect(created.detail).toBeUndefined();
  });

  it("says nothing for a normal 4/4 write", async () => {
    const created = await createInSlot(2, { notes: "n/4 C1 1|1,2,3,4" });

    expect(created.detail).toBeUndefined();
  });

  it("counts an existing note a new one cut short through update-clip", async () => {
    // The half note at 1|1 runs into the new C1 at 1|2; Live cuts it there.
    const created = await createInSlot(3, { notes: "n/2 C1 1|1" });
    const updated = parseToolResult<{ detail?: string }>(
      await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: { id: created.id, notes: "n/4 C1 1|2" },
      }),
    );

    expect(updated.detail).toBe(
      "1 note shortened by the next note at the same pitch",
    );
  });
});

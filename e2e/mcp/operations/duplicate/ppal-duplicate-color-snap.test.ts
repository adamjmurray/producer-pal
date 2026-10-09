// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for what ppal-duplicate says when Live snaps a color to its
 * palette. Every copy that landed in a snapped color says so on its own entry,
 * however the copy was made: a clip that grows to fill the scene goes through
 * update-clip, and one that already fits is colored directly.
 * Uses: e2e-test-set (t8 and t10 are empty MIDI tracks; s5-s7 are empty scenes)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/operations/duplicate/ppal-duplicate-color-snap.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { CHILD_TRACK, EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** Colors Live has no swatch for, so every write of one is snapped. */
const OFF_PALETTE = ["#123456", "#654321", "#0F1E2D"];

/** What an entry says about a snapped color, whichever swatch Live chose. */
const SNAPPED =
  /^color #[\dA-F]{6} is not in Live's palette; landed as #[\dA-F]{6}$/;

interface CopiedClip {
  id: string;
  path: string;
  color?: string;
  detail?: string;
}

describe("ppal-duplicate when Live snaps a color to its palette", () => {
  /**
   * Put a clip in a session slot.
   * @param path - The slot
   * @param length - The clip's length
   */
  async function createClip(path: string, length: string): Promise<void> {
    await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path, notes: "C3 1|1", length },
    });
  }

  /**
   * How many clips a session scene holds.
   * @param path - The scene
   * @returns Its clip count
   */
  async function sceneClipCount(path: string): Promise<number> {
    const scene = parseToolResult<{ clips?: unknown[] }>(
      await ctx.client!.callTool({
        name: "ppal-read-scene",
        arguments: { path, include: ["clips"] },
      }),
    );

    return scene.clips?.length ?? 0;
  }

  // The scene's clips are as long as its longest, so some copies grow to fill
  // the length (through update-clip) and the longest does not (colored
  // directly). The two routes used to say different things.
  it("says so on every clip of a scene copied to the arrangement", async () => {
    // Scene s5's longest clip is on the first track, s6's on the second, and
    // s7's clips are both as long as the scene.
    await createClip(`t${EMPTY_MIDI_TRACK}/s5`, "2bar");
    await createClip(`t${CHILD_TRACK}/s5`, "1bar");
    await createClip(`t${EMPTY_MIDI_TRACK}/s6`, "1bar");
    await createClip(`t${CHILD_TRACK}/s6`, "2bar");
    await createClip(`t${EMPTY_MIDI_TRACK}/s7`, "1bar");
    await createClip(`t${CHILD_TRACK}/s7`, "1bar");

    await sleep(100);

    // The scenes hold only the clips made here.
    for (const path of ["s5", "s6", "s7"]) {
      expect(await sceneClipCount(path)).toBe(2);
    }

    const copies = parseToolResult<{ clips: CopiedClip[] }[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "scene",
          path: "s5,s6,s7",
          toPath: "[17|1],[21|1],[25|1]",
          color: OFF_PALETTE.join(","),
        },
      }),
    );

    expect(copies).toHaveLength(3);

    // A clip shorter than its scene is tiled to fill it, and each tile is a
    // clip of the answer: s5 and s6 hold one clip a bar short of the scene
    // (two tiles) beside the long one, and s7's clips already fit.
    expect(copies.map((copy) => copy.clips.length)).toStrictEqual([3, 3, 2]);

    for (const copy of copies) {
      for (const clip of copy.clips) {
        expect(clip.detail).toMatch(SNAPPED);
        expect(clip.color).toMatch(/^#[\dA-F]{6}$/);
      }
    }
  });

  it("says so on a scene copied in the session", async () => {
    await createClip(`t${EMPTY_MIDI_TRACK}/s5`, "1bar");

    await sleep(100);

    const copy = parseToolResult<{ detail?: string; color?: string }>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "scene", path: "s5", color: OFF_PALETTE[0] },
      }),
    );

    expect(copy.detail).toMatch(SNAPPED);
    expect(copy.color).toMatch(/^#[\dA-F]{6}$/);
  });

  /**
   * Copy the clip in s5 into another scene's slot, with a color.
   * @param scene - The destination scene
   * @param color - The color to ask for
   * @returns The copy's entry
   */
  async function copyClipTo(
    scene: number,
    color: string | undefined,
  ): Promise<CopiedClip> {
    return parseToolResult<CopiedClip>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "clip",
          path: `t${EMPTY_MIDI_TRACK}/s5`,
          toPath: `t${EMPTY_MIDI_TRACK}/s${scene}`,
          color,
        },
      }),
    );
  }

  it("says so on a clip copied into a slot", async () => {
    await createClip(`t${EMPTY_MIDI_TRACK}/s5`, "1bar");

    await sleep(100);

    const copy = await copyClipTo(6, OFF_PALETTE[0]);

    expect(copy.detail).toMatch(SNAPPED);
    expect(copy.color).toMatch(/^#[\dA-F]{6}$/);
  });

  it("says nothing for a color that is already a swatch", async () => {
    await createClip(`t${EMPTY_MIDI_TRACK}/s5`, "1bar");

    await sleep(100);

    // Read what Live snaps the off-palette color to, then ask for it verbatim.
    const first = await copyClipTo(6, OFF_PALETTE[0]);

    await sleep(100);

    const exact = await copyClipTo(7, first.color);

    expect(exact.detail).toBeUndefined();
    expect(exact.color).toBeUndefined();
  });
});

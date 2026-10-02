// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for a bad transform argument: the same text is wrong for every
 * clip, so ppal-update-clip, ppal-create-clip and ppal-duplicate each refuse it
 * once, before any clip is touched.
 * Uses: e2e-test-set - t8 is the empty MIDI track.
 * Run with: npm run e2e:mcp -- ppal-clip-transforms-refusals
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";
import { createClipTransformHelpers } from "../helpers/ppal-clip-transforms-test-helpers.ts";

const ctx = setupMcpTestContext();
const { createMidiClip, readClipNotes } = createClipTransformHelpers(ctx);

const BAD_TRANSFORM = "ratchet(1)";
const REFUSAL = "ratchet() needs a count of 2 or more";

/**
 * Assert a tool call was refused with the transform's message.
 * @param result - The raw tool result
 */
function expectRefused(result: unknown): void {
  expect(isToolError(result)).toBe(true);
  expect(getToolErrorMessage(result)).toContain(REFUSAL);
}

/**
 * Assert the slot still holds no clip (or the scene was never made).
 * @param path - The slot's path
 */
async function expectNoClip(path: string): Promise<void> {
  await sleep(100);

  const read = await ctx.client!.callTool({
    name: "ppal-read-clip",
    arguments: { path },
  });

  expect(getToolErrorMessage(read)).toMatch(/no (clip|scene) at/);
}

describe("ppal-clip-transforms (bad argument refused up front)", () => {
  it("ppal-update-clip refuses it and leaves the clip alone", async () => {
    const clipId = await createMidiClip(92, "v80 C3 1|1");

    expectRefused(
      await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: { id: clipId, name: "renamed", transforms: BAD_TRANSFORM },
      }),
    );
    // Still the one note, not ratcheted
    expect((await readClipNotes(clipId)).match(/C3/g)).toHaveLength(1);

    const read = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { id: clipId },
    });

    expect(JSON.stringify(read)).not.toContain("renamed");
  });

  it("ppal-create-clip refuses it and creates no clip", async () => {
    const path = `t${EMPTY_MIDI_TRACK}/s93`;

    expectRefused(
      await ctx.client!.callTool({
        name: "ppal-create-clip",
        arguments: { path, notes: "C3 1|1", transforms: BAD_TRANSFORM },
      }),
    );
    await expectNoClip(path);
  });

  it("ppal-duplicate refuses it and makes no copy", async () => {
    const clipId = await createMidiClip(94, "v80 C3 1|1");
    const toPath = `t${EMPTY_MIDI_TRACK}/s95`;

    expectRefused(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "clip",
          id: clipId,
          toPath,
          transforms: BAD_TRANSFORM,
        },
      }),
    );
    await expectNoClip(toPath);
  });

  it("ppal-update-clip points a syntax error at the failing token", async () => {
    const clipId = await createMidiClip(96, "v80 C3 1|1");
    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: { id: clipId, transforms: "velocity = rand(1 2)" },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain('near "2)"');
    expect(getToolErrorMessage(result)).toContain('expected ",", ")"');
    expect((await readClipNotes(clipId)).match(/C3/g)).toHaveLength(1);
  });
});

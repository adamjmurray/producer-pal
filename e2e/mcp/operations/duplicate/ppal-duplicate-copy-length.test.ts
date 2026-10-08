// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for arrangementLength on a clip whose copy is longer than its
 * loop: a looped session clip with pre-roll, and an arrangement clip that spans
 * more than its loop. Asking for the loop length used to be read as "no change"
 * and copied the whole span.
 * Uses: e2e-test-set (t8 is an empty MIDI track; s5 is an empty scene)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/operations/duplicate/ppal-duplicate-copy-length.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

describe("ppal-duplicate arrangementLength on a copy longer than its loop", () => {
  /**
   * Call a tool and parse its result.
   * @param name - The tool
   * @param args - Its arguments
   * @returns The parsed result
   */
  async function call<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const result = parseToolResult<T>(
      await ctx.client!.callTool({ name, arguments: args }),
    );

    await sleep(100);

    return result;
  }

  /**
   * Copy a clip to the arrangement and read the copy's length back.
   * @param id - The clip to copy
   * @param bar - The bar to copy it to
   * @param arrangementLength - The length to ask for, if any
   * @returns The copy's id and arrangement length
   */
  async function copyTo(
    id: string,
    bar: number,
    arrangementLength?: string,
  ): Promise<{ id: string; length?: string }> {
    const copy = await call<{ id: string }>("ppal-duplicate", {
      type: "clip",
      id,
      toPath: `t${EMPTY_MIDI_TRACK}[${bar}|1]`,
      ...(arrangementLength != null && { arrangementLength }),
    });
    const read = await call<ReadClipResult>("ppal-read-clip", {
      id: copy.id,
      include: ["timing"],
    });

    return { id: copy.id, length: read.arrangementLength };
  }

  it("copies at the loop length when that is what's asked", async () => {
    // A 3-bar loop with a 1-bar pre-roll: a plain copy is 4 bars long.
    const source = await call<{ id: string }>("ppal-create-clip", {
      path: `t${EMPTY_MIDI_TRACK}/s5`,
      notes: "C3 1|1",
      length: "4bar",
      looping: true,
    });

    await call("ppal-update-clip", {
      id: source.id,
      start: "2|1",
      length: "3bar",
      firstStart: "1|1",
    });

    expect((await copyTo(source.id, 301)).length).toBe("4bar");
    expect((await copyTo(source.id, 311, "3bar")).length).toBe("3bar");

    // The plain copy spans 4 bars of a 3-bar loop.
    const spanning = await copyTo(source.id, 321);

    expect((await copyTo(spanning.id, 331, "3bar")).length).toBe("3bar");
  });
});

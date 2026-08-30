// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-duplicate with a list of sources in `id`.
 * Uses: e2e-test-set (t8 and t10 are empty MIDI tracks; s5-s7 are empty scenes)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/operations/ppal-duplicate-source-list.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { CHILD_TRACK, EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

interface DuplicateClipResult {
  id: string;
  path?: string;
  arrangementStart?: string;
}

describe("ppal-duplicate with a source list", () => {
  /**
   * Two source clips in scene 5, one per empty MIDI track. Their notes differ
   * so a copy says which source it came from.
   * @returns The two clip ids, in track order
   */
  async function createSources(): Promise<[string, string]> {
    const first = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${EMPTY_MIDI_TRACK}/s5`,
        notes: "C3 1|1",
        length: "1bar",
      },
    });
    const second = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: {
        path: `t${CHILD_TRACK}/s5`,
        notes: "D3 1|1",
        length: "1bar",
      },
    });

    await sleep(100);

    return [
      parseToolResult<{ id: string }>(first).id,
      parseToolResult<{ id: string }>(second).id,
    ];
  }

  /**
   * Duplicate clips.
   * @param args - ppal-duplicate arguments beyond the clip type
   * @returns The raw tool result, so a caller can read its warnings
   */
  function duplicateClips(args: Record<string, unknown>): Promise<unknown> {
    return ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "clip", ...args },
    });
  }

  /**
   * Read a clip back by id.
   * @param id - The clip to read
   * @returns The clip
   */
  async function readClip(id: string): Promise<ReadClipResult> {
    return parseToolResult<ReadClipResult>(
      await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { id },
      }),
    );
  }

  it("gives each source its own clip slot", async () => {
    const [firstId, secondId] = await createSources();

    const copies = parseToolResult<DuplicateClipResult[]>(
      await duplicateClips({
        id: `${firstId},${secondId}`,
        toPath: `t${EMPTY_MIDI_TRACK}/s6,t${CHILD_TRACK}/s6`,
        name: "One,Two",
      }),
    );

    expect(copies).toHaveLength(2);
    expect(copies[0]!.path).toBe(`t${EMPTY_MIDI_TRACK}/s6`);
    expect(copies[1]!.path).toBe(`t${CHILD_TRACK}/s6`);

    await sleep(100);

    // The notes say which source landed where, and the names are counted
    // across the whole call rather than restarting per source.
    const first = await readClip(copies[0]!.id);
    const second = await readClip(copies[1]!.id);

    expect(first.name).toBe("One");
    expect(first.notes).toContain("C3");
    expect(second.name).toBe("Two");
    expect(second.notes).toContain("D3");
  });

  it("drops every source at one arrangementStart, on its own track", async () => {
    const [firstId, secondId] = await createSources();

    const copies = parseToolResult<DuplicateClipResult[]>(
      await duplicateClips({
        id: `${firstId},${secondId}`,
        arrangementStart: "97|1",
      }),
    );

    expect(copies).toHaveLength(2);
    expect(copies[0]!.path).toBe(`t${EMPTY_MIDI_TRACK}`);
    expect(copies[1]!.path).toBe(`t${CHILD_TRACK}`);
    expect(copies[0]!.arrangementStart).toBe("97|1");
    expect(copies[1]!.arrangementStart).toBe("97|1");
  });

  // A clip slot holds one clip, so the second source can't be broadcast onto
  // the slot the first one claimed.
  it("warns and skips the sources a short toPath doesn't reach", async () => {
    const [firstId, secondId] = await createSources();

    const { data, warnings } = parseToolResultWithWarnings<DuplicateClipResult>(
      await duplicateClips({
        id: `${firstId},${secondId}`,
        toPath: `t${EMPTY_MIDI_TRACK}/s6`,
      }),
    );

    expect(data.path).toBe(`t${EMPTY_MIDI_TRACK}/s6`);
    expect(warnings.join("\n")).toContain(
      "toPath names 1 destination(s) for 2 sources",
    );

    await sleep(100);

    // The first source landed; the second was skipped rather than pasted over it.
    expect((await readClip(data.id)).notes).toContain("C3");
  });
});

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
}

/** The entry for a copy a later copy in the same call landed on. */
interface OverwrittenClipResult {
  path: string;
  overwritten: true;
}

describe("ppal-duplicate with a source list", () => {
  /**
   * Create one source clip.
   * @param path - Where the clip goes
   * @param notes - The clip's notes, so a copy says which source it came from
   * @param length - The clip's length
   * @returns The new clip's id
   */
  async function createSource(
    path: string,
    notes: string,
    length = "1bar",
  ): Promise<string> {
    const result = await ctx.client!.callTool({
      name: "ppal-create-clip",
      arguments: { path, notes, length },
    });

    return parseToolResult<{ id: string }>(result).id;
  }

  /**
   * Two source clips in scene 5, one per empty MIDI track.
   * @returns The two clip ids, in track order
   */
  async function createSources(): Promise<[string, string]> {
    const first = await createSource(`t${EMPTY_MIDI_TRACK}/s5`, "C3 1|1");
    const second = await createSource(`t${CHILD_TRACK}/s5`, "D3 1|1");

    await sleep(100);

    return [first, second];
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
        arguments: { id, include: ["notes"] },
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

  it("drops every source at one bare position, on its own track", async () => {
    const [firstId, secondId] = await createSources();

    const copies = parseToolResult<DuplicateClipResult[]>(
      await duplicateClips({
        id: `${firstId},${secondId}`,
        toPath: "[97|1]",
      }),
    );

    expect(copies).toHaveLength(2);
    // Each copy stayed on its own source's track, both at bar 97.
    expect(copies[0]!.path).toBe(`t${EMPTY_MIDI_TRACK}[97|1]`);
    expect(copies[1]!.path).toBe(`t${CHILD_TRACK}[97|1]`);
  });

  // A destination list pairs with the sources instead of going to each of
  // them, so two sources on one track take a bar each rather than both landing
  // on both bars, where the second would bury the first.
  it("pairs a positioned toPath list one destination per source", async () => {
    const [firstId, secondId] = await createSources();

    const copies = parseToolResult<DuplicateClipResult[]>(
      await duplicateClips({
        id: `${firstId},${secondId}`,
        toPath: `t${EMPTY_MIDI_TRACK}[109|1],t${EMPTY_MIDI_TRACK}[113|1]`,
      }),
    );

    expect(copies).toHaveLength(2);
    expect(copies.some((copy) => "overwritten" in copy)).toBe(false);
    expect(copies[0]!.path).toBe(`t${EMPTY_MIDI_TRACK}[109|1]`);
    expect(copies[1]!.path).toBe(`t${EMPTY_MIDI_TRACK}[113|1]`);

    await sleep(100);

    // The notes say each destination holds the source it was paired with.
    expect((await readClip(copies[0]!.id)).notes).toContain("C3");
    expect((await readClip(copies[1]!.id)).notes).toContain("D3");
  });

  // Two sources on ONE track default to that track, so a single position piles
  // them: the second copy lands on the first. Every id the result hands back
  // still has to name a clip that is there.
  it("hands back no id for a copy a later source landed on", async () => {
    const first = await createSource(`t${EMPTY_MIDI_TRACK}/s5`, "C3 1|1");
    const second = await createSource(`t${EMPTY_MIDI_TRACK}/s6`, "D3 1|1");

    await sleep(100);

    const copies = parseToolResult<
      (DuplicateClipResult | OverwrittenClipResult)[]
    >(
      await duplicateClips({
        id: [first, second].join(","),
        toPath: "[97|1]",
      }),
    );

    expect(copies).toHaveLength(2);
    // The first copy is gone, so its entry says where it went and stops there.
    expect(copies[0]).toStrictEqual({
      path: `t${EMPTY_MIDI_TRACK}[97|1]`,
      overwritten: true,
    });
    expect(copies[1]!.path).toBe(`t${EMPTY_MIDI_TRACK}[97|1]`);

    await sleep(100);

    // Every id that came back names a clip that is really there.
    for (const copy of copies) {
      if (!("id" in copy)) {
        continue;
      }

      expect((await readClip(copy.id)).notes).toContain("D3");
    }
  });

  // A copy is cleared by whatever lands across it, not only by one starting on
  // the same beat. Both entries name a different bar here, and one of them is
  // still a clip that no longer exists.
  it("hands back no id for a copy the next one cleared", async () => {
    const session = await createSource(
      `t${EMPTY_MIDI_TRACK}/s5`,
      "C3 1|1",
      "4bar",
    );

    await sleep(100);

    // Copy it to the arrangement first: an arrangement source is what routes
    // the overlap through Producer Pal's own clearing rather than leaving it
    // to Live.
    const source = parseToolResult<DuplicateClipResult>(
      await duplicateClips({
        id: session,
        toPath: `t${EMPTY_MIDI_TRACK}[89|1]`,
      }),
    );

    await sleep(100);

    // The copy at 101 spans four bars, so it clears the front of the one at
    // 102 - which leaves that one deleted and its tail re-created at 105.
    const copies = parseToolResult<
      (DuplicateClipResult | OverwrittenClipResult)[]
    >(
      await duplicateClips({
        id: source.id,
        toPath: `t${EMPTY_MIDI_TRACK}[102|1],t${EMPTY_MIDI_TRACK}[101|1]`,
      }),
    );

    expect(copies[0]).toStrictEqual({
      path: `t${EMPTY_MIDI_TRACK}[102|1]`,
      overwritten: true,
    });
    expect(copies[1]!.path).toBe(`t${EMPTY_MIDI_TRACK}[101|1]`);

    await sleep(100);

    for (const copy of copies) {
      if (!("id" in copy)) {
        continue;
      }

      expect((await readClip(copy.id)).notes).toContain("C3");
    }
  });

  // duplicate used to take a path only for a drum pad, so a path a model just
  // read out of a result could not be spent here.
  it("names its sources by path, and by path alongside id", async () => {
    await createSources();

    const byPath = parseToolResult<DuplicateClipResult[]>(
      await duplicateClips({
        path: `t${EMPTY_MIDI_TRACK}/s5,t${CHILD_TRACK}/s5`,
        toPath: `t${EMPTY_MIDI_TRACK}/s6,t${CHILD_TRACK}/s6`,
      }),
    );

    expect(byPath).toHaveLength(2);

    await sleep(100);

    expect((await readClip(byPath[0]!.id)).notes).toContain("C3");
    expect((await readClip(byPath[1]!.id)).notes).toContain("D3");

    // id and path name different sources, so they add up.
    const mixed = parseToolResult<DuplicateClipResult[]>(
      await duplicateClips({
        id: byPath[0]!.id,
        path: `t${CHILD_TRACK}/s5`,
        toPath: `t${EMPTY_MIDI_TRACK}/s7,t${CHILD_TRACK}/s7`,
      }),
    );

    expect(mixed).toHaveLength(2);
    expect(mixed[0]!.path).toBe(`t${EMPTY_MIDI_TRACK}/s7`);
    expect(mixed[1]!.path).toBe(`t${CHILD_TRACK}/s7`);
  });

  // A duplicate leaves copies behind, so an unresolvable source refuses the
  // whole call rather than making the copies it can.
  it("refuses the call when a source path names nothing", async () => {
    const [firstId] = await createSources();

    const result = await duplicateClips({
      id: firstId,
      path: `t${EMPTY_MIDI_TRACK}/s7`,
      toPath: `t${EMPTY_MIDI_TRACK}/s6,t${CHILD_TRACK}/s6`,
    });

    expect(JSON.stringify(result)).toContain("nothing to duplicate at path");

    await sleep(100);

    // Nothing ran: the id source did not get copied either.
    const slot = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: `t${EMPTY_MIDI_TRACK}/s6` },
    });

    expect(JSON.stringify(slot)).toContain(
      `no clip at t${EMPTY_MIDI_TRACK}/s6`,
    );
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

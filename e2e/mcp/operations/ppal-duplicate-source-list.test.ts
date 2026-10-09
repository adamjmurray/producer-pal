// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for ppal-duplicate's lists: a list of sources in `id`, and values
 * that pair one per copy.
 * Uses: e2e-test-set (t8 and t10 are empty MIDI tracks; s5-s7 are empty scenes)
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/operations/ppal-duplicate-source-list.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  createTestDeviceAt,
  parseToolResult,
  type ReadClipResult,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers.ts";
import { CHILD_TRACK, EMPTY_MIDI_TRACK } from "../e2e-test-set.ts";

const ctx = setupMcpTestContext();

interface DuplicateClipResult {
  id: string;
  path?: string;
  detail?: string;
}

/** The entry for a copy that couldn't be made. */
interface SkippedResult {
  path: string;
  ok: false;
  detail: string;
}

/** The entry for a copy a later copy in the same call covered whole. */
interface UnwrittenClipResult {
  path: string;
  detail: string;
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

  /**
   * Assert a slot is still empty, after a call that should have changed
   * nothing.
   * @param path - The clip slot to read
   */
  async function expectNoClipAt(path: string): Promise<void> {
    const slot = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path },
    });

    expect(JSON.stringify(slot)).toContain(`no clip at ${path}`);
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
    expect(copies.some((copy) => "deleted" in copy)).toBe(false);
    expect(copies[0]!.path).toBe(`t${EMPTY_MIDI_TRACK}[109|1]`);
    expect(copies[1]!.path).toBe(`t${EMPTY_MIDI_TRACK}[113|1]`);

    await sleep(100);

    // The notes say each destination holds the source it was paired with.
    expect((await readClip(copies[0]!.id)).notes).toContain("C3");
    expect((await readClip(copies[1]!.id)).notes).toContain("D3");
  });

  // Two sources on ONE track default to that track, so a single position piles
  // them: the second copy covers the first whole, which is never written. Every
  // id the result hands back still has to name a clip that is there.
  it("leaves a copy a later source covers unwritten", async () => {
    const first = await createSource(`t${EMPTY_MIDI_TRACK}/s5`, "C3 1|1");
    const second = await createSource(`t${EMPTY_MIDI_TRACK}/s6`, "D3 1|1");

    await sleep(100);

    const copies = parseToolResult<
      (DuplicateClipResult | UnwrittenClipResult)[]
    >(
      await duplicateClips({
        id: [first, second].join(","),
        toPath: "[97|1]",
      }),
    );

    expect(copies).toHaveLength(2);
    // The first copy was never written, so its entry says where it was headed
    // and what covered it.
    expect(copies[0]).toStrictEqual({
      path: `t${EMPTY_MIDI_TRACK}[97|1]`,
      detail: `overwritten later in this call by t${EMPTY_MIDI_TRACK}[97|1]`,
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

  // Scenes pair the same way clips do: each scene takes its own position,
  // rather than every scene landing on every position over the one before.
  it("pairs a scene position list one position per scene", async () => {
    await createSource(`t${EMPTY_MIDI_TRACK}/s5`, "C3 1|1");
    await createSource(`t${EMPTY_MIDI_TRACK}/s6`, "D3 1|1");

    await sleep(100);

    const copies = parseToolResult<{ clips: DuplicateClipResult[] }[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "scene", path: "s5,s6", toPath: "[97|1],[101|1]" },
      }),
    );

    expect(copies.map((copy) => copy.clips.map((c) => c.path))).toStrictEqual([
      [`t${EMPTY_MIDI_TRACK}[97|1]`],
      [`t${EMPTY_MIDI_TRACK}[101|1]`],
    ]);

    await sleep(100);

    expect((await readClip(copies[0]!.clips[0]!.id)).notes).toContain("C3");
    expect((await readClip(copies[1]!.clips[0]!.id)).notes).toContain("D3");
  });

  it("reports each session scene copy where a later source pushed it", async () => {
    await createSource(`t${EMPTY_MIDI_TRACK}/s5`, "C3 1|1");
    await createSource(`t${EMPTY_MIDI_TRACK}/s6`, "D3 1|1");

    await sleep(100);

    // s6's copy lands at s7; s5's copy then lands at s6 and pushes it to s8.
    const copies = parseToolResult<
      { id: string; path: string; clips: DuplicateClipResult[] }[]
    >(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: { type: "scene", path: "s6,s5" },
      }),
    );

    expect(
      copies.map((copy) => [copy.path, copy.clips.map((c) => c.path)]),
    ).toStrictEqual([
      ["s8", [`t${EMPTY_MIDI_TRACK}/s8`]],
      ["s6", [`t${EMPTY_MIDI_TRACK}/s6`]],
    ]);

    await sleep(100);

    for (const [copy, note] of [
      [copies[0]!, "D3"],
      [copies[1]!, "C3"],
    ] as const) {
      const scene = parseToolResult<{ id: string }>(
        await ctx.client!.callTool({
          name: "ppal-read-scene",
          arguments: { path: copy.path },
        }),
      );
      const clip = parseToolResult<ReadClipResult>(
        await ctx.client!.callTool({
          name: "ppal-read-clip",
          arguments: { path: copy.clips[0]!.path, include: ["notes"] },
        }),
      );

      expect(scene.id).toBe(copy.id);
      expect(clip.id).toBe(copy.clips[0]!.id);
      expect(clip.notes).toContain(note);
    }
  });

  // A copy is cut by whatever lands across it, not only by one starting on the
  // same beat. Losing its front re-creates the rest under a new id, so the
  // entry has to name that clip, not the one that is gone.
  it("points a copy the next one cut short at what is left of it", async () => {
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
    // 102, whose tail is re-created at 105.
    const copies = parseToolResult<DuplicateClipResult[]>(
      await duplicateClips({
        id: source.id,
        toPath: `t${EMPTY_MIDI_TRACK}[102|1],t${EMPTY_MIDI_TRACK}[101|1]`,
      }),
    );

    expect(copies[0]).toStrictEqual({
      id: expect.any(String),
      path: `t${EMPTY_MIDI_TRACK}[105|1]`,
      detail: `shortened by t${EMPTY_MIDI_TRACK}[101|1] later in this call`,
    });
    expect(copies[1]!.path).toBe(`t${EMPTY_MIDI_TRACK}[101|1]`);

    await sleep(100);

    // Both ids name a clip that is really there, where the entry says.
    for (const copy of copies) {
      expect((await readClip(copy.id)).path).toBe(copy.path);
    }
  });

  /**
   * Session sources on the empty MIDI track, one per scene from s5.
   * @param lengths - Each source's length, in call order
   * @returns The source ids
   */
  async function createSessionSources(lengths: string[]): Promise<string> {
    const ids: string[] = [];

    for (const [index, length] of lengths.entries()) {
      ids.push(
        await createSource(
          `t${EMPTY_MIDI_TRACK}/s${5 + index}`,
          "C3 1|1",
          length,
        ),
      );
    }

    await sleep(100);

    return ids.join(",");
  }

  // The 1bar takes the 4bar's front, re-creating the rest; the n/2 then lands
  // inside that rest and splits it. The 4bar's entry names the end piece.
  it("points a copy a later copy split at its end piece", async () => {
    const id = await createSessionSources(["4bar", "1bar", "n/2"]);
    const copies = parseToolResult<DuplicateClipResult[]>(
      await duplicateClips({
        id,
        toPath: `t${EMPTY_MIDI_TRACK}[211|1],t${EMPTY_MIDI_TRACK}[211|1],t${EMPTY_MIDI_TRACK}[213|1]`,
      }),
    );

    // The n/2 copy came last, so it is the one named as cutting the 4bar.
    expect(copies[0]).toStrictEqual({
      id: expect.any(String),
      path: `t${EMPTY_MIDI_TRACK}[213|3]`,
      detail: `shortened by t${EMPTY_MIDI_TRACK}[213|1] later in this call`,
    });

    await sleep(100);

    for (const copy of copies) {
      expect((await readClip(copy.id)).path).toBe(copy.path);
    }
  });

  // The 1bar and the 3bar between them cover the 4bar, which is never written,
  // and the n/2 splits the 3bar. The tail is the 3bar's, not a piece of the 4bar.
  // The n/2 is the last copy over that ground, so it is the one named.
  it("keeps a split tail from a copy that landed before the one it split", async () => {
    const id = await createSessionSources(["4bar", "1bar", "3bar", "n/2"]);
    const copies = parseToolResult<
      (DuplicateClipResult | UnwrittenClipResult)[]
    >(
      await duplicateClips({
        id,
        toPath: [221, 221, 222, 223]
          .map((bar) => `t${EMPTY_MIDI_TRACK}[${bar}|1]`)
          .join(","),
      }),
    );

    expect(copies[0]).toStrictEqual({
      path: `t${EMPTY_MIDI_TRACK}[221|1]`,
      detail: `overwritten later in this call by t${EMPTY_MIDI_TRACK}[223|1]`,
    });
    expect(copies.slice(1).map((copy) => copy.path)).toStrictEqual([
      `t${EMPTY_MIDI_TRACK}[221|1]`,
      `t${EMPTY_MIDI_TRACK}[222|1]`,
      `t${EMPTY_MIDI_TRACK}[223|1]`,
    ]);
  });

  // A-B-A song layout: A is named twice, apart. Copies are made in the order
  // named, so each later copy cuts the one before it, B's across A's and then
  // the second A's across B's, whichever source it came from.
  it("makes the copies of a source named twice in the order named", async () => {
    const a = await createSource(`t${EMPTY_MIDI_TRACK}/s5`, "C3 1|1", "2bar");
    const b = await createSource(`t${EMPTY_MIDI_TRACK}/s6`, "D3 1|1", "2bar");

    await sleep(100);

    const copies = parseToolResult<DuplicateClipResult[]>(
      await duplicateClips({
        id: [a, b, a].join(","),
        toPath: [231, 232, 233]
          .map((bar) => `t${EMPTY_MIDI_TRACK}[${bar}|1]`)
          .join(","),
      }),
    );

    expect(copies.map((copy) => copy.detail)).toStrictEqual([
      `shortened by t${EMPTY_MIDI_TRACK}[232|1] later in this call`,
      `shortened by t${EMPTY_MIDI_TRACK}[233|1] later in this call`,
      undefined,
    ]);

    await sleep(100);

    // Each copy is still where its entry says, with its own source's notes.
    const clips = await Promise.all(copies.map((copy) => readClip(copy.id)));

    expect(clips.map((clip) => clip.path)).toStrictEqual(
      copies.map((copy) => copy.path),
    );
    expect(clips[0]!.notes).toContain("C3");
    expect(clips[1]!.notes).toContain("D3");
    expect(clips[2]!.notes).toContain("C3");
  });

  // The second turn of A doesn't hide the first one's copy landing on B, which
  // would clear it before its turn.
  it("refuses a copy onto a later source even when its own source comes again", async () => {
    const a = await createSource(`t${EMPTY_MIDI_TRACK}/s5`, "C3 1|1", "2bar");
    const b = await createSource(`t${EMPTY_MIDI_TRACK}/s6`, "D3 1|1", "2bar");

    await sleep(100);

    const arranged = parseToolResult<DuplicateClipResult>(
      await duplicateClips({ id: b, toPath: `t${EMPTY_MIDI_TRACK}[241|1]` }),
    );

    await sleep(100);

    const result = await duplicateClips({
      id: [a, arranged.id, a].join(","),
      toPath: [241, 250, 260]
        .map((bar) => `t${EMPTY_MIDI_TRACK}[${bar}|1]`)
        .join(","),
    });

    expect(JSON.stringify(result)).toContain("would overwrite id");
    expect(JSON.stringify(result)).toContain(arranged.id);
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

  // A source that names nothing keeps its slot as a skip, and the others still
  // copy.
  it("skips a source path that names nothing and copies the other", async () => {
    const [firstId] = await createSources();

    const copies = parseToolResult<(DuplicateClipResult | SkippedResult)[]>(
      await duplicateClips({
        id: firstId,
        path: `t${EMPTY_MIDI_TRACK}/s7`,
        toPath: `t${EMPTY_MIDI_TRACK}/s6,t${CHILD_TRACK}/s6`,
      }),
    );

    expect(copies).toHaveLength(2);
    expect(copies[0]).toStrictEqual({
      id: expect.any(String),
      path: `t${EMPTY_MIDI_TRACK}/s6`,
    });
    expect(copies[1]).toStrictEqual({
      path: `t${CHILD_TRACK}/s6`,
      ok: false,
      detail: expect.stringContaining(`t${EMPTY_MIDI_TRACK}/s7`),
    });

    await sleep(100);

    expect(
      (await readClip((copies[0] as DuplicateClipResult).id)).notes,
    ).toContain("C3");
    await expectNoClipAt(`t${CHILD_TRACK}/s6`);
  });

  // A lone source that names nothing has no list to hold its place in, so the
  // reason comes back as the call's error.
  it("throws why a lone source id names nothing", async () => {
    const result = await duplicateClips({
      id: "999999",
      toPath: `t${EMPTY_MIDI_TRACK}/s6`,
    });

    expect(JSON.stringify(result)).toContain('id \\"999999\\" does not exist');
  });

  // A clip slot holds one clip, so the second source can't be broadcast onto
  // the slot the first one claimed. Nothing has run yet, so the call is refused
  // whole rather than leaving a copy behind for the caller to clean up.
  it("refuses a toPath too short for the sources", async () => {
    const [firstId, secondId] = await createSources();

    const result = await duplicateClips({
      id: `${firstId},${secondId}`,
      toPath: `t${EMPTY_MIDI_TRACK}/s6`,
    });

    expect(JSON.stringify(result)).toContain(
      "toPath names 1 destination but id names 2 sources",
    );

    await sleep(100);

    // Not even the first source was copied.
    await expectNoClipAt(`t${EMPTY_MIDI_TRACK}/s6`);
  });

  // The other half of the same mismatch: more destinations than sources leave
  // one naming a place no copy goes.
  it("refuses more destinations than sources", async () => {
    const [firstId, secondId] = await createSources();

    const result = await duplicateClips({
      id: `${firstId},${secondId}`,
      toPath: `t${EMPTY_MIDI_TRACK}/s6,t${CHILD_TRACK}/s6,t${EMPTY_MIDI_TRACK}/s7`,
    });

    expect(JSON.stringify(result)).toContain(
      "toPath names 3 destinations but id names 2 sources",
    );

    await sleep(100);
    await expectNoClipAt(`t${EMPTY_MIDI_TRACK}/s6`);
  });

  // Two per source isn't dealt out either: the caller would have to count to
  // know which copy went where.
  it("refuses a few destinations per source", async () => {
    const [firstId, secondId] = await createSources();

    const result = await duplicateClips({
      id: `${firstId},${secondId}`,
      toPath: `t${EMPTY_MIDI_TRACK}/s6,t${EMPTY_MIDI_TRACK}/s7,t${CHILD_TRACK}/s6,t${CHILD_TRACK}/s7`,
    });

    expect(JSON.stringify(result)).toContain(
      "toPath names 4 destinations but id names 2 sources",
    );

    await sleep(100);
    await expectNoClipAt(`t${EMPTY_MIDI_TRACK}/s6`);
  });

  // A track and a position name one spot, so the second copy would bury the
  // first. Only a bare position covers several sources.
  it("refuses one positioned toPath for two sources", async () => {
    const [firstId, secondId] = await createSources();

    const result = await duplicateClips({
      id: `${firstId},${secondId}`,
      toPath: `t${EMPTY_MIDI_TRACK}[117|1]`,
    });

    expect(JSON.stringify(result)).toContain(
      "toPath names 1 destination but id names 2 sources",
    );

    await sleep(100);

    const spot = await ctx.client!.callTool({
      name: "ppal-read-clip",
      arguments: { path: `t${EMPTY_MIDI_TRACK}[117|1]` },
    });

    expect(JSON.stringify(spot)).toContain("no clip at");
  });

  // Scenes share every track, so one position for two scenes would bury the
  // first copy under the second.
  it("refuses one position for two scenes", async () => {
    await createSources();

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "scene", path: "s5,s6", toPath: "[117|1]" },
    });

    expect(JSON.stringify(result)).toContain(
      "toPath names 1 destination but path names 2 sources",
    );
  });

  // arrangementLength pairs one per copy, as name does, so one clip holding an
  // A-B phrase lays out A-A-AB in one call.
  it("gives each copy of one source its own arrangementLength", async () => {
    const sourceId = await createSource(
      `t${EMPTY_MIDI_TRACK}/s0`,
      "C3 1|1\nG3 2|1",
      "2bar",
    );

    await sleep(100);

    const copies = parseToolResult<DuplicateClipResult[]>(
      await duplicateClips({
        id: sourceId,
        toPath: `t${EMPTY_MIDI_TRACK}[1|1],[2|1],[3|1]`,
        arrangementLength: "1bar,1bar,2bar",
      }),
    );

    await sleep(100);

    const lengths: Array<string | undefined> = [];

    for (const copy of copies) {
      const read = await ctx.client!.callTool({
        name: "ppal-read-clip",
        arguments: { id: copy.id, include: ["timing"] },
      });

      lengths.push(parseToolResult<ReadClipResult>(read).arrangementLength);
    }

    expect(lengths).toStrictEqual(["1bar", "1bar", "2bar"]);
  });

  // An insert ahead of an earlier copy pushes it along, so each entry is read
  // back where the copy ends up.
  it("reports each device copy where a later copy pushed it", async () => {
    const source = await createTestDeviceAt(
      ctx.client!,
      "Saturator",
      `t${EMPTY_MIDI_TRACK}`,
    );

    const copies = parseToolResult<Array<{ id: string; path: string }>>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "device",
          path: source,
          toPath: `t${EMPTY_MIDI_TRACK}/d+,t${EMPTY_MIDI_TRACK}/d0`,
        },
      }),
    );

    await sleep(100);

    expect(copies).toHaveLength(2);

    for (const copy of copies) {
      const read = parseToolResult<{ id: string }>(
        await ctx.client!.callTool({
          name: "ppal-read-device",
          arguments: { path: copy.path },
        }),
      );

      expect(read.id).toBe(copy.id);
    }
  });
});

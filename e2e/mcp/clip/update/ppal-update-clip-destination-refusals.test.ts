// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for a toPath ppal-update-clip can make nothing of. Each one is a
 * reason on the clip's own entry, never a warning, and a lone clip throws it
 * instead — there is no list for an entry to hold a place in.
 *
 * Only real Live has the locators, so only here does a name that is missing
 * differ from a name that is there.
 *
 * Uses: e2e-test-set - t8 (empty MIDI track); locators Intro/Verse/Chorus/Bridge
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- ppal-update-clip-destination-refusals
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import { createArrangementClip } from "../helpers/ppal-clip-transforms-test-helpers.ts";
import {
  arrangementClipAt,
  readClipFully,
} from "../helpers/clip-io-test-helpers.ts";
import { EMPTY_MIDI_TRACK } from "../../e2e-test-set.ts";

const ctx = setupMcpTestContext();

/** The Set's locators are Intro, Verse, Chorus and Bridge — never this. */
const MISSING_LOCATOR = "Nope";

/** One entry of a multi-clip update result. */
interface ClipEntry {
  id?: string;
  path?: string;
  ok?: false;
  detail?: string;
}

describe("ppal-update-clip destinations it can make nothing of", () => {
  it("reports a locator the Set doesn't have on the clip's own entry", async () => {
    const missed = await createArrangementClip(ctx, "601|1", "C3 1|1", "1bar");
    const moved = await createArrangementClip(ctx, "605|1", "C3 1|1", "1bar");

    const { data, warnings } = parseToolResultWithWarnings<ClipEntry[]>(
      await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: {
          id: `${missed},${moved}`,
          toPath: `t${EMPTY_MIDI_TRACK}[loc:${MISSING_LOCATOR}],t${EMPTY_MIDI_TRACK}[620|1]`,
        },
      }),
    );

    await sleep(200);

    expect(data[0]).toStrictEqual({
      id: missed,
      ok: false,
      detail: `not moved: no locator found with name "${MISSING_LOCATOR}" for toPath`,
    });
    expect(warnings).toStrictEqual([]);
    // The good half of the list still moved, and the missed clip stayed put.
    expect(data[1]?.path).toBe(`t${EMPTY_MIDI_TRACK}[620|1]`);
    expect((await readClipFully(ctx.client!, { id: missed })).path).toBe(
      `t${EMPTY_MIDI_TRACK}[601|1]`,
    );
  });

  it("resolves a locator the Set does have, so the miss is the lookup", async () => {
    const clipId = await createArrangementClip(ctx, "630|1", "C3 1|1", "1bar");

    const { data } = parseToolResultWithWarnings<ClipEntry>(
      await ctx.client!.callTool({
        name: "ppal-update-clip",
        arguments: {
          id: clipId,
          toPath: `t${EMPTY_MIDI_TRACK}[loc:Bridge]`,
        },
      }),
    );

    await sleep(200);

    expect(data.path).toBe(`t${EMPTY_MIDI_TRACK}[33|1]`);
  });

  it("throws for a lone clip whose locator the Set doesn't have", async () => {
    const clipId = await createArrangementClip(ctx, "640|1", "C3 1|1", "1bar");

    const result = await ctx.client!.callTool({
      name: "ppal-update-clip",
      arguments: {
        id: clipId,
        toPath: `t${EMPTY_MIDI_TRACK}[loc:${MISSING_LOCATOR}]`,
      },
    });

    await sleep(200);

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `no locator found with name "${MISSING_LOCATOR}" for toPath`,
    );
    expect((await readClipFully(ctx.client!, { id: clipId })).path).toBe(
      `t${EMPTY_MIDI_TRACK}[640|1]`,
    );
  });

  // "l=" once named the lane an "l+" before it appended, and never shipped, so
  // it is just an unknown segment now. Every tool that takes a clip destination
  // turns it down, and with one clip named each turns down the whole call.
  it.each([
    {
      tool: "ppal-update-clip",
      position: "660|1",
      args: (id: string) => ({
        id,
        toPath: `t${EMPTY_MIDI_TRACK}/l=[660|1]`,
      }),
    },
    {
      tool: "ppal-duplicate",
      position: "670|1",
      args: (id: string) => ({
        type: "clip",
        id,
        toPath: `t${EMPTY_MIDI_TRACK}/l=[670|1]`,
      }),
    },
    {
      tool: "ppal-create-clip",
      position: "680|1",
      args: () => ({
        path: `t${EMPTY_MIDI_TRACK}/l=[680|1]`,
        notes: "C3 1|1",
        length: "1bar",
      }),
    },
  ])("refuses the retired l= on $tool", async ({ tool, position, args }) => {
    const clipId = await createArrangementClip(ctx, "650|1", "C3 1|1", "1bar");

    const result = await ctx.client!.callTool({
      name: tool,
      arguments: args(clipId),
    });

    await sleep(200);

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      '"l=" is not a device, chain, or drum pad',
    );
    // Nothing was left behind where the refused path pointed.
    expect(
      await arrangementClipAt(ctx.client!, EMPTY_MIDI_TRACK, position),
    ).toBeUndefined();
  });
});

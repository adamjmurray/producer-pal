// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for `ppal-duplicate type="chain"`.
 *
 * Live has copy_pad for a drum pad but nothing for a rack layer, so the copy is
 * built out of insert_chain plus the temp-track workaround. Only real Live
 * shows whether the devices actually land in the new chain, and whether the
 * temp track is gone afterwards.
 *
 * Uses: racks-test — "Outer" is an Instrument Rack whose chain 0 holds the
 * "Kit" Drum Rack. See e2e/live-sets/racks-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-chain
 */
import { describe, expect, it } from "vitest";
import { parseToolResult, setupMcpTestContext } from "../mcp-test-helpers";
import {
  callWithWarnings,
  RACKS_TEST_PATH,
} from "./helpers/racks-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

const OUTER = "t0/d0";

interface ChainResult {
  id?: string;
  path?: string;
}

interface RackRead {
  chains?: { id: string; name?: string; deviceCount?: number }[];
  drumPads?: { pitch?: string; chainCount?: number }[];
}

/**
 * Read a rack's chains.
 * @param path - Producer Pal path to the rack
 * @returns The rack's chains
 */
async function readChains(path: string) {
  const result = parseToolResult<RackRead>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path, include: ["chains"], maxDepth: 0 },
    }),
  );

  return result.chains ?? [];
}

describe("ppal-duplicate type=chain", () => {
  it("copies a chain into its own rack, with its devices", async () => {
    const before = await readChains(OUTER);
    const source = before[0]!;
    const sourceDevices = source.deviceCount ?? 0;

    // A copy of an empty chain would prove nothing about carrying devices.
    expect(sourceDevices).toBeGreaterThan(0);

    const { data, warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-duplicate",
      { type: "chain", id: source.id, name: "Copied" },
    );

    const copy = data as ChainResult;

    expect(copy.id).toBeDefined();

    const after = await readChains(OUTER);

    expect(after).toHaveLength(before.length + 1);

    const made = after.find((chain) => chain.id === copy.id);

    expect(made?.name).toBe("Copied");
    expect(made?.deviceCount).toBe(sourceDevices);

    // The rack carries macro mappings, so that warning is expected; nothing
    // else should have gone wrong.
    expect(warnings.filter((w) => !w.includes("macro mappings"))).toStrictEqual(
      [],
    );
  });

  // The temp-track workaround copies the whole track. If it ever failed to
  // clean up, the Set would be left with a stray duplicate.
  it("leaves no temporary track behind", async () => {
    const before = parseToolResult<{ tracks?: unknown[] }>(
      await ctx.client!.callTool({ name: "ppal-read-live-set", arguments: {} }),
    );

    const sourceId = (await readChains(OUTER))[0]!.id;

    await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "chain", id: sourceId },
    });

    const after = parseToolResult<{ tracks?: unknown[] }>(
      await ctx.client!.callTool({ name: "ppal-read-live-set", arguments: {} }),
    );

    expect(after.tracks?.length).toBe(before.tracks?.length);
  });

  // Cross-rack is the headline of this feature, and the send carry only has
  // anything to do in real Live. "Kit" has two return chains; "Sub Kit", nested
  // on its F1 pad, has none — so a Clap chain copied across must drop them.
  it("copies a drum chain into another drum rack, dropping the sends it cannot carry", async () => {
    const KIT = `${OUTER}/c0/d0`;
    const SUB_KIT = `${KIT}/pF1/d0`;

    const clap = (await readChains(`${KIT}/pE1`))[0];

    expect(clap?.id).toBeDefined();

    // Give the source a send to lose. The saved Set leaves Clap's sends down,
    // and a chain with none proves nothing about carrying them.
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: clap!.id, sendGainDb: -12, sendReturn: "B Reverb" },
    });

    const { warnings } = await callWithWarnings(ctx.client!, "ppal-duplicate", {
      type: "chain",
      id: clap!.id,
      toPath: SUB_KIT,
    });

    expect(warnings.join()).toContain("no return chain named");

    // Sub Kit starts with only a C3 pad, so an E1 pad is the copy — landing
    // there rather than on the catch-all also proves the in_note carried.
    const pads =
      parseToolResult<RackRead>(
        await ctx.client!.callTool({
          name: "ppal-read-device",
          arguments: { path: SUB_KIT, include: ["drum-pads"], maxDepth: 0 },
        }),
      ).drumPads ?? [];

    expect(pads.map((pad) => pad.pitch)).toContain("E1");
  });

  // insert_chain appends to a Drum Rack on the catch-all pad, so a copy has to
  // be moved onto the pad its source sounds on or it lands nowhere useful.
  it("puts a copied drum chain on the same pad as its source", async () => {
    const KIT = `${OUTER}/c0/d0`;

    const clap = (await readChains(`${KIT}/pE1`))[0];

    await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: { type: "chain", id: clap!.id },
    });

    // E1 is the Clap pad: the copy layers onto it rather than landing on p*.
    const layered = await readChains(`${KIT}/pE1`);

    expect(layered.length).toBeGreaterThan(1);
  });

  it("refuses a destination rack of a different kind", async () => {
    const sourceId = (await readChains(OUTER))[0]!.id;

    // The Kit is a Drum Rack, so an Instrument Rack's chain has no place in it.
    const { warnings } = await callWithWarnings(ctx.client!, "ppal-duplicate", {
      type: "chain",
      id: sourceId,
      toPath: `${OUTER}/c0/d0`,
    });

    expect(warnings.join()).toContain("chains of its own kind");
  });
});

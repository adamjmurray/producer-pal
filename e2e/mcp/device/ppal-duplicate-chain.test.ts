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
  chains?: {
    id: string;
    name?: string;
    deviceCount?: number;
    devices?: unknown[];
    gainDb?: number;
    pan?: number;
  }[];
  drumPads?: { pitch?: string; chainCount?: number }[];
}

/**
 * Check a call raised the warnings it had to and no others. A substring check
 * on its own passes while an unrelated warning rides along — which is how the
 * false "trim stays behind" sat on these drum cases unnoticed.
 *
 * Every copy out of the Kit carries the macro-mappings warning, so a call that
 * has anything else to say lists both.
 * @param warnings - The call's warnings
 * @param expected - A substring of each warning the call should raise
 */
function expectOnlyWarnings(warnings: string[], expected: string[]): void {
  for (const substring of expected) {
    expect(warnings.join()).toContain(substring);
  }

  expect(
    warnings.filter(
      (warning) => !expected.some((substring) => warning.includes(substring)),
    ),
  ).toStrictEqual([]);
}

/**
 * Read a rack's chains.
 * @param path - Producer Pal path to the rack
 * @param maxDepth - 0 leaves chains unexpanded; 1 lists each chain's devices
 * @returns The rack's chains
 */
async function readChains(path: string, maxDepth = 0) {
  const result = parseToolResult<RackRead>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path, include: ["chains"], maxDepth },
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

    expectOnlyWarnings(warnings, [
      "no return chain named",
      "has macro mappings",
    ]);

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

    expectOnlyWarnings(warnings, ["chains of its own kind"]);
  });

  // The same carry as the instrument case below, on a chain addressed by its
  // pad — the devices move to "pE1/cN", a destination that path never builds.
  // Clap holds a sampler, so devices really do have to cross.
  // Runs late: it leaves a trim and an extra layer on the Kit's E1 pad.
  it("carries a drum chain's trim onto its copy, devices and all", async () => {
    const KIT = `${OUTER}/c0/d0`;

    const source = (await readChains(`${KIT}/pE1`, 1))[0]!;

    expect(source.devices?.length).toBeGreaterThan(0);

    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: source.id, gainDb: -3, pan: -0.5 },
    });

    const { data, warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-duplicate",
      { type: "chain", id: source.id, name: "Trimmed Clap" },
    );

    // The Kit's macro mappings are the only thing this copy has to report.
    expectOnlyWarnings(warnings, ["has macro mappings"]);

    const copy = (await readChains(`${KIT}/pE1`, 1)).find(
      (chain) => chain.id === (data as ChainResult).id,
    );

    expect(copy?.gainDb).toBeCloseTo(-3, 1);
    expect(copy?.pan).toBeCloseTo(-0.5, 2);
    expect(copy?.devices?.length).toBe(source.devices?.length);
  });

  // The chain's own fader is copied before its devices are moved across, and
  // the move used to report it as left behind — naming the temp track it read
  // it off, and telling the model to redo a write that had already landed.
  // Runs last: it leaves a trim on the source chain.
  it("carries a non-default trim onto the copy without warning it stayed behind", async () => {
    const source = (await readChains(OUTER))[0]!;

    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: source.id, gainDb: -2, pan: 0.25 },
    });

    const { data, warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-duplicate",
      { type: "chain", id: source.id, name: "Trimmed Copy" },
    );

    expect(warnings.join()).not.toContain("stays behind");

    const copy = (await readChains(OUTER)).find(
      (chain) => chain.id === (data as ChainResult).id,
    );

    expect(copy?.gainDb).toBeCloseTo(-2, 1);
    expect(copy?.pan).toBeCloseTo(0.25, 2);
  });
});

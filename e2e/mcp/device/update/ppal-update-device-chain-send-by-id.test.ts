// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for naming a chain send's return chain by id, and for setting
 * several of a chain's sends in one call with `sends`.
 * Uses: racks-test, whose "Kit" Drum Rack has the two return chains
 * "A Saturator" and "B Reverb". See e2e/live-sets/racks-test-spec.md.
 *
 * Rack return chains can't be created through the Live API, so this needs the
 * prepared Set. The unit tests use mock ids; only real Live proves the id
 * read-device reports is the one the send lookup matches on.
 *
 * Run with: npm run e2e:mcp -- ppal-update-device-chain-send-by-id
 */
import { describe, expect, it } from "vitest";
import { setupMcpTestContext } from "../../mcp-test-helpers.ts";
import {
  callWithWarnings,
  KIT,
  padChain,
  RACKS_TEST_PATH,
  readKitPads,
  readReturnChains,
} from "../helpers/racks-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

describe("update-device sendReturn by id", () => {
  // Clap, whose sends carry no macro mapping, so a refused write can't be
  // mistaken for a failed match.
  const CLAP = `${KIT}/pE1`;

  it("writes the send named by a return chain id", async () => {
    const returns = await readReturnChains(ctx.client!);
    const reverb = returns.find((rc) => rc.name === "B Reverb");

    expect(reverb?.id).toBeDefined();

    const { warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-update-device",
      { path: CLAP, sendGainDb: -14, sendReturn: reverb!.id },
    );

    expect(warnings).toStrictEqual([]);

    const sends = padChain(await readKitPads(ctx.client!), "Clap").sends ?? [];
    const written = sends.find((s) => s.return === "B Reverb");

    expect(written?.gainDb).toBeCloseTo(-14, 1);
  });

  it("warns and skips an id that is not one of the rack's return chains", async () => {
    // The rack's own id: a real Live object, and not a return chain of it.
    const kit = await readKitPads(ctx.client!);

    const { warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-update-device",
      { path: CLAP, sendGainDb: -3, sendReturn: kit.id },
    );

    expect(
      warnings.some((w) => w.includes(`no return chain matching "${kit.id}"`)),
    ).toBe(true);

    const sends = padChain(await readKitPads(ctx.client!), "Clap").sends ?? [];

    expect(sends.find((s) => s.return === "B Reverb")?.gainDb).toBeCloseTo(
      -14,
      1,
    );
  });

  // The write result says what landed. Live clamps and snaps the
  // level, so the argument alone doesn't say what the send ends up holding.
  it("reports the sends it wrote, read back at Live's display resolution", async () => {
    const returns = await readReturnChains(ctx.client!);
    const saturator = returns.find((rc) => rc.name === "A Saturator");

    const { data, warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-update-device",
      { path: CLAP, sends: [{ return: saturator!.id, gainDb: -6.333333 }] },
    );

    expect(warnings).toStrictEqual([]);
    // Live hands back a 32-bit float, so an unrounded read reports
    // -6.333000183105469. The id is the one a read reports, so the result
    // round-trips straight back into `sends`.
    expect(data.sends).toStrictEqual([
      { return: "A Saturator", returnId: saturator!.id, gainDb: -6.33 },
    ]);
  });

  it("reports the sendGainDb/sendReturn pair under sends too", async () => {
    const returns = await readReturnChains(ctx.client!);
    const reverb = returns.find((rc) => rc.name === "B Reverb");

    // One send has one shape in the result, whichever param spelled it.
    const { data, warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-update-device",
      { path: CLAP, sendGainDb: -11, sendReturn: reverb!.id },
    );

    expect(warnings).toStrictEqual([]);
    expect(data.sends).toStrictEqual([
      { return: "B Reverb", returnId: reverb!.id, gainDb: -11 },
    ]);
  });

  it("reports no send for a return name that matches none", async () => {
    const { data, warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-update-device",
      { path: CLAP, sends: [{ return: "ZZZ", gainDb: -6 }] },
    );

    expect(
      warnings.some((w) => w.includes('no return chain matching "ZZZ"')),
    ).toBe(true);
    // Nothing was written, so nothing is reported as though it had been.
    expect(data.sends).toBeUndefined();
  });

  // The multi-send write, and the round trip that makes it usable: what a read
  // reports as `returnId` is what `sends` takes back.
  it("sets both sends in one call, addressed by the ids a read reported", async () => {
    const before = padChain(await readKitPads(ctx.client!), "Clap").sends ?? [];
    const returns = await readReturnChains(ctx.client!);

    // Every read send names its return by id; that id is what goes back in.
    for (const send of before) {
      expect(returns.some((rc) => rc.id === send.returnId)).toBe(true);
    }

    const ids = ["A Saturator", "B Reverb"].map(
      (name) => returns.find((rc) => rc.name === name)!.id,
    );

    const { warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-update-device",
      {
        path: CLAP,
        sends: [
          { return: ids[0], gainDb: -20 },
          { return: ids[1], gainDb: -8 },
        ],
      },
    );

    expect(warnings).toStrictEqual([]);

    const after = padChain(await readKitPads(ctx.client!), "Clap").sends ?? [];

    expect(after.find((s) => s.return === "A Saturator")?.gainDb).toBeCloseTo(
      -20,
      1,
    );
    expect(after.find((s) => s.return === "B Reverb")?.gainDb).toBeCloseTo(
      -8,
      1,
    );
  });
});

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

  it("refuses an id that is not one of the rack's return chains", async () => {
    // The rack's own id: a real Live object, and not a return chain of it.
    const kit = await readKitPads(ctx.client!);

    const { data, warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-update-device",
      { path: CLAP, sendGainDb: -3, sendReturn: kit.id },
    );

    expect(data.sends).toStrictEqual([
      expect.objectContaining({
        return: kit.id,
        ok: false,
        reason: expect.stringContaining(`no return chain matching "${kit.id}"`),
      }),
    ]);
    expect(warnings).toStrictEqual([]);

    const sends = padChain(await readKitPads(ctx.client!), "Clap").sends ?? [];

    expect(sends.find((s) => s.return === "B Reverb")?.gainDb).toBeCloseTo(
      -14,
      1,
    );
  });

  /**
   * Write the Clap pad's sends and read the levels back off it.
   * @param args - The update-device args that write the send
   * @returns What the write reported under `sends`, and the Clap's levels after
   */
  async function writeClapSends(args: Record<string, unknown>): Promise<{
    reported: unknown;
    after: Array<{ return: string; gainDb?: number }>;
  }> {
    const { data, warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-update-device",
      { path: CLAP, ...args },
    );

    expect(warnings).toStrictEqual([]);

    return {
      reported: data.sends,
      after: padChain(await readKitPads(ctx.client!), "Clap").sends ?? [],
    };
  }

  // A send that took the level asked for has nothing to say, so the write is
  // silent and a read is what proves it landed. Live hands the level back as a
  // 32-bit float, which reads as -6.33 — the level asked for, at the
  // resolution reads publish.
  it("says nothing about a send that took the level asked for", async () => {
    const returns = await readReturnChains(ctx.client!);
    const saturator = returns.find((rc) => rc.name === "A Saturator");
    const { reported, after } = await writeClapSends({
      sends: [{ return: saturator!.id, gainDb: -6.333333 }],
    });

    expect(reported).toBeUndefined();
    expect(after.find((s) => s.return === "A Saturator")?.gainDb).toBe(-6.33);
  });

  // One send has one shape in the result, whichever param spelled it — here,
  // no shape at all.
  it("says nothing about the sendGainDb/sendReturn pair either", async () => {
    const returns = await readReturnChains(ctx.client!);
    const reverb = returns.find((rc) => rc.name === "B Reverb");
    const { reported, after } = await writeClapSends({
      sendGainDb: -11,
      sendReturn: reverb!.id,
    });

    expect(reported).toBeUndefined();
    expect(after.find((s) => s.return === "B Reverb")?.gainDb).toBe(-11);
  });

  it("reports no send for a return name that matches none", async () => {
    const { data, warnings } = await callWithWarnings(
      ctx.client!,
      "ppal-update-device",
      { path: CLAP, sends: [{ return: "ZZZ", gainDb: -6 }] },
    );

    // Nothing was written, so the send carries the reason in place of a level.
    expect(data.sends).toStrictEqual([
      expect.objectContaining({
        return: "ZZZ",
        ok: false,
        reason: expect.stringContaining('no return chain matching "ZZZ"'),
      }),
    ]);
    expect(warnings).toStrictEqual([]);
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

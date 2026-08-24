// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for naming a chain send's return chain by id.
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
import { setupMcpTestContext } from "../mcp-test-helpers.ts";
import {
  callWithWarnings,
  KIT,
  padChain,
  RACKS_TEST_PATH,
  readKitPads,
  readReturnChains,
} from "./helpers/racks-test-helpers.ts";

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
});

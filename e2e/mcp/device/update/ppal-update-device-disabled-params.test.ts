// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for writes to macro-mapped (disabled) parameters.
 * Uses: racks-test, whose "Kit" Drum Rack has macros mapped onto specific
 * chain mixer and device parameters. See e2e/live-sets/racks-test-spec.md.
 *
 * Live accepts a `set` on a disabled parameter, reports success, and ignores
 * it — so these assert the write is refused with a warning rather than
 * silently doing nothing. Macro mappings can't be made through the Live API,
 * which is why they're baked into the Set.
 *
 * Run with: npm run e2e:mcp -- ppal-update-device-disabled-params
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
  warnsDisabled,
} from "../helpers/racks-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

describe("update-device on macro-mapped parameters", () => {
  describe("drum pad chains", () => {
    it("refuses gain and pan on a fully mapped pad", async () => {
      const { warnings } = await callWithWarnings(
        ctx.client!,
        "ppal-update-device",
        { path: `${KIT}/pC1`, gainDb: -12, pan: -0.5 },
      );

      expect(warnsDisabled(warnings, 'chain "Kick" gainDb')).toBe(true);
      expect(warnsDisabled(warnings, 'chain "Kick" pan')).toBe(true);

      const chain = padChain(await readKitPads(ctx.client!), "Kick");

      expect(chain.gainDb).toBeUndefined();
      expect(chain.pan).toBeUndefined();
    });

    // Macros map one parameter at a time, so a chain can have a dead gain and
    // a live pan. The warning has to be per-parameter, not per-chain.
    it("refuses only the mapped parameter, letting the rest through", async () => {
      const { warnings } = await callWithWarnings(
        ctx.client!,
        "ppal-update-device",
        { path: `${KIT}/pD1`, gainDb: -12, pan: 0.25 },
      );

      expect(warnsDisabled(warnings, 'chain "Snare" gainDb')).toBe(true);
      expect(warnsDisabled(warnings, 'chain "Snare" pan')).toBe(false);

      const chain = padChain(await readKitPads(ctx.client!), "Snare");

      expect(chain.gainDb).toBeUndefined();
      expect(chain.pan).toBeCloseTo(0.25, 2);
    });

    it("writes both on an unmapped pad, with no warning", async () => {
      const { warnings } = await callWithWarnings(
        ctx.client!,
        "ppal-update-device",
        { path: `${KIT}/pE1`, gainDb: -9, pan: 0.5 },
      );

      expect(warnings).toStrictEqual([]);

      const chain = padChain(await readKitPads(ctx.client!), "Clap");

      expect(chain.gainDb).toBeCloseTo(-9, 1);
      expect(chain.pan).toBeCloseTo(0.5, 2);
    });
  });

  describe("chain sends", () => {
    it("refuses a mapped send but writes the other one on the same chain", async () => {
      const mapped = await callWithWarnings(ctx.client!, "ppal-update-device", {
        path: `${KIT}/pC1`,
        sendGainDb: -10,
        sendReturn: "A",
      });

      expect(
        warnsDisabled(mapped.warnings, 'chain "Kick" send "A Saturator"'),
      ).toBe(true);

      const open = await callWithWarnings(ctx.client!, "ppal-update-device", {
        path: `${KIT}/pC1`,
        sendGainDb: -14,
        sendReturn: "B",
      });

      expect(open.warnings).toStrictEqual([]);

      const sends =
        padChain(await readKitPads(ctx.client!), "Kick").sends ?? [];

      expect(sends.map((s) => s.return)).toStrictEqual(["B Reverb"]);
      expect(sends[0]!.gainDb).toBeCloseTo(-14, 0);
    });
  });

  // A rack's return chains can be mapped too, and they're only creatable in
  // Live — the reason this Set exists rather than being built at test runtime.
  describe("rack return chains", () => {
    it("refuses gain and pan on a mapped return chain", async () => {
      const { warnings } = await callWithWarnings(
        ctx.client!,
        "ppal-update-device",
        { path: `${KIT}/rc0`, gainDb: -8, pan: -0.75 },
      );

      expect(warnsDisabled(warnings, 'chain "A Saturator" gainDb')).toBe(true);
      expect(warnsDisabled(warnings, 'chain "A Saturator" pan')).toBe(true);

      const returns = await readReturnChains(ctx.client!);
      const saturator = returns.find((c) => c.name === "A Saturator");

      expect(saturator!.gainDb).toBeUndefined();
      expect(saturator!.pan).toBeUndefined();
    });

    it("writes gain and pan on an unmapped return chain", async () => {
      const { warnings } = await callWithWarnings(
        ctx.client!,
        "ppal-update-device",
        { path: `${KIT}/rc1`, gainDb: -8, pan: -0.75 },
      );

      expect(warnings).toStrictEqual([]);

      const returns = await readReturnChains(ctx.client!);
      const reverb = returns.find((c) => c.name === "B Reverb");

      expect(reverb!.gainDb).toBeCloseTo(-8, 1);
      expect(reverb!.pan).toBeCloseTo(-0.75, 2);
    });
  });

  // The exposure isn't limited to the chain mixer: a mapped device parameter
  // written through `params` no-ops the same way, and that's the more common
  // case in factory racks.
  describe("device parameters", () => {
    it("refuses a mapped device parameter", async () => {
      const { warnings } = await callWithWarnings(
        ctx.client!,
        "ppal-update-device",
        {
          path: `${KIT}/pC1/c0/d0`,
          params: [{ name: "Volume", value: "-18" }],
        },
      );

      expect(
        warnings.some(
          (w) =>
            w.includes('param "Volume"') &&
            w.includes("is disabled and was not changed"),
        ),
      ).toBe(true);
    });

    it("writes an unmapped device parameter", async () => {
      const { warnings } = await callWithWarnings(
        ctx.client!,
        "ppal-update-device",
        {
          path: `${KIT}/pE1/c0/d0`,
          params: [{ name: "Volume", value: "-18" }],
        },
      );

      expect(warnings).toStrictEqual([]);
    });
  });
});

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
 * it — so these assert the write is refused on the target's entry: a detail
 * beside whatever landed, and an error when it was all the call asked. Macro
 * mappings can't be made through the Live API, which is why they're baked into
 * the Set.
 *
 * Run with: npm run e2e:mcp -- ppal-update-device-disabled-params
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  setupMcpTestContext,
} from "../../mcp-test-helpers.ts";
import { RACKS_TEST_PATH } from "../../e2e-test-set.ts";
import {
  callWithWarnings,
  KIT,
  padChain,
  readKitPads,
  readReturnChains,
} from "../helpers/racks-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

const DISABLED = "is disabled and was not changed";

/**
 * Call update-device expecting the call to be refused.
 * @param args - Tool arguments
 * @returns The error message
 */
async function refusal(args: Record<string, unknown>): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-update-device",
    arguments: args,
  });

  return getToolErrorMessage(result);
}

describe("update-device on macro-mapped parameters", () => {
  describe("drum pad chains", () => {
    it("refuses gain and pan on a fully mapped pad", async () => {
      const message = await refusal({
        path: `${KIT}/pC1`,
        gainDb: -12,
        pan: -0.5,
      });

      expect(message).toContain(`gainDb ${DISABLED}`);
      expect(message).toContain(`pan ${DISABLED}`);

      const chain = padChain(await readKitPads(ctx.client!), "Kick");

      expect(chain.gainDb).toBeUndefined();
      expect(chain.pan).toBeUndefined();
    });

    // Macros map one parameter at a time, so a chain can have a dead gain and
    // a live pan. The refusal has to be per-parameter, not per-chain.
    it("refuses only the mapped parameter, letting the rest through", async () => {
      const { data, warnings } = await callWithWarnings(
        ctx.client!,
        "ppal-update-device",
        { path: `${KIT}/pD1`, gainDb: -12, pan: 0.25 },
      );

      expect(warnings).toStrictEqual([]);
      expect(data.ok).toBeUndefined();
      expect(data.detail).toContain(`gainDb ${DISABLED}`);
      expect(data.detail).not.toContain(`pan ${DISABLED}`);

      const chain = padChain(await readKitPads(ctx.client!), "Snare");

      expect(chain.gainDb).toBeUndefined();
      expect(chain.pan).toBeCloseTo(0.25, 2);
    });

    it("writes both on an unmapped pad, with no warning", async () => {
      const { data, warnings } = await callWithWarnings(
        ctx.client!,
        "ppal-update-device",
        { path: `${KIT}/pE1`, gainDb: -9, pan: 0.5 },
      );

      expect(warnings).toStrictEqual([]);
      expect(data.detail ?? "").not.toContain(DISABLED);

      const chain = padChain(await readKitPads(ctx.client!), "Clap");

      expect(chain.gainDb).toBeCloseTo(-9, 1);
      expect(chain.pan).toBeCloseTo(0.5, 2);
    });

    it("keeps a refused pad's slot in a list", async () => {
      const { data, warnings } = await callWithWarnings(
        ctx.client!,
        "ppal-update-device",
        { path: `${KIT}/pC1,${KIT}/pE1`, gainDb: -9 },
      );
      const entries = data as unknown as Record<string, unknown>[];

      expect(warnings).toStrictEqual([]);
      expect(entries[0]).toStrictEqual({
        path: `${KIT}/pC1`,
        ok: false,
        detail: expect.stringContaining(`gainDb ${DISABLED}`),
      });
      expect(entries[1]!.ok).toBeUndefined();
    });
  });

  describe("chain sends", () => {
    it("refuses a lone mapped send, naming it", async () => {
      const message = await refusal({
        path: `${KIT}/pC1`,
        sendGainDb: -10,
        sendReturn: "A",
      });

      expect(message).toMatch(/no send landed — "A Saturator": gainDb/);
      expect(message).toContain(DISABLED);
    });

    it("keeps a mapped send's slot beside one that landed", async () => {
      const { data, warnings } = await callWithWarnings(
        ctx.client!,
        "ppal-update-device",
        {
          path: `${KIT}/pC1`,
          sends: [
            { return: "A", gainDb: -10 },
            { return: "B", gainDb: -14 },
          ],
        },
      );

      expect(warnings).toStrictEqual([]);
      expect(data.sends).toContainEqual({
        return: "A Saturator",
        returnId: expect.any(String),
        ok: false,
        detail: expect.stringContaining(`gainDb ${DISABLED}`),
      });

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
      const message = await refusal({
        path: `${KIT}/rc0`,
        gainDb: -8,
        pan: -0.75,
      });

      expect(message).toContain(`gainDb ${DISABLED}`);
      expect(message).toContain(`pan ${DISABLED}`);

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
    it("refuses a lone mapped device parameter, naming it", async () => {
      const message = await refusal({
        path: `${KIT}/pC1/c0/d0`,
        params: [{ name: "Volume", value: "-18" }],
      });

      expect(message).toMatch(/no param landed — "Volume": /);
      expect(message).toContain(DISABLED);
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

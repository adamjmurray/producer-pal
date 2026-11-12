// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for Live 13's racks with fixed chains: the Mid-Side Rack (Mid,
 * Side) and the Multiband Rack (Low, Mid, High). Live turns every insert_chain
 * down on them (Max answers 1, Python throws), so each path that would add a
 * chain is refused up front with the rack's limit and chains.
 *
 * A read of either rack shows its limit as `maxChains`.
 *
 * Live 13 only: the Set can't be opened by Live 12, so the suite skips there.
 * Uses: live-13-test, t1 (d0 Mid-Side Rack, d1 Multiband Rack). See
 * e2e/live-sets/specs/live-13-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- ppal-fixed-chain-racks
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  parseToolResult,
  setupMcpTestContext,
} from "../../../mcp-test-helpers";
import { LIVE_13_OR_NEWER, LIVE_13_TEST_PATH } from "../../../e2e-test-set.ts";

const MID_SIDE = "t1/d0";
const MULTIBAND = "t1/d1";

const MID_SIDE_LIMIT = "Mid-Side Rack (id";
const MULTIBAND_LIMIT = "Multiband Rack (id";

interface RackRead {
  maxChains?: number;
  chains?: { id: string; name?: string; deviceCount?: number }[];
}

describe.skipIf(!LIVE_13_OR_NEWER)("racks with fixed chains (Live 13)", () => {
  const ctx = setupMcpTestContext({
    once: true,
    liveSetPath: LIVE_13_TEST_PATH,
  });

  /**
   * Read a rack's chains.
   * @param path - Producer Pal path to the rack
   * @returns The rack's chains
   */
  async function readChains(
    path: string,
  ): Promise<NonNullable<RackRead["chains"]>> {
    const result = parseToolResult<RackRead>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path, include: ["chains"], maxDepth: 0 },
      }),
    );

    return result.chains ?? [];
  }

  // getToolErrorMessage throws when the call succeeded.
  const failure = async (
    tool: string,
    params: Record<string, unknown>,
  ): Promise<string> =>
    getToolErrorMessage(
      await ctx.client!.callTool({ name: tool, arguments: params }),
    );

  it.each([
    [MID_SIDE, 2],
    [MULTIBAND, 3],
  ])("shows the chain limit of %s when read", async (path, limit) => {
    const withChains = parseToolResult<RackRead>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path, include: ["chains"], maxDepth: 0 },
      }),
    );
    const bare = parseToolResult<RackRead>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path, include: [] },
      }),
    );

    expect(withChains.maxChains).toBe(limit);
    expect(bare.maxChains).toBe(limit);
  });

  it("has the fixed chains the spec lists", async () => {
    expect(
      (await readChains(MID_SIDE)).map((chain) => chain.name),
    ).toStrictEqual(["Mid", "Side"]);
    expect(
      (await readChains(MULTIBAND)).map((chain) => chain.name),
    ).toStrictEqual(["Low", "Mid", "High"]);
  });

  it.each([
    [MID_SIDE, MID_SIDE_LIMIT, "has a fixed 2 chains (Mid, Side)", 2],
    [MULTIBAND, MULTIBAND_LIMIT, "has a fixed 3 chains (Low, Mid, High)", 3],
  ])(
    "refuses c+ and c<n> past the last chain on %s",
    async (rack, label, limit, count) => {
      for (const path of [`${rack}/c+`, `${rack}/c${count}/d+`]) {
        const message = await failure("ppal-create-device", {
          deviceName: "Utility",
          path,
        });

        expect(message).toContain(label);
        expect(message).toContain(limit);
      }

      expect(await readChains(rack)).toHaveLength(count);
    },
  );

  it("still adds a device inside a chain the rack has", async () => {
    const before = await readChains(MULTIBAND);

    const created = parseToolResult<{ path?: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "Utility", path: `${MULTIBAND}/c0/d+` },
      }),
    );

    expect(created.path).toMatch(/^t1\/d1\/c0\/d\d+$/);

    const after = await readChains(MULTIBAND);

    expect(after).toHaveLength(before.length);
    expect(after[0]?.deviceCount).toBe((before[0]?.deviceCount ?? 0) + 1);
  });

  it("refuses to copy a chain, into its own rack or by toPath", async () => {
    const chains = await readChains(MID_SIDE);
    const id = chains[0]!.id;

    expect(await failure("ppal-duplicate", { type: "chain", id })).toContain(
      MID_SIDE_LIMIT,
    );
    expect(
      await failure("ppal-duplicate", {
        type: "chain",
        id,
        toPath: `${MID_SIDE}/c+`,
      }),
    ).toContain("has a fixed 2 chains (Mid, Side)");
    expect(await readChains(MID_SIDE)).toHaveLength(2);
  });

  it("refuses to move a device into a new chain", async () => {
    const created = parseToolResult<{ id: string }>(
      await ctx.client!.callTool({
        name: "ppal-create-device",
        arguments: { deviceName: "Utility", path: `${MID_SIDE}/c0/d+` },
      }),
    );

    expect(
      await failure("ppal-update-device", {
        id: created.id,
        toPath: `${MID_SIDE}/c+`,
      }),
    ).toContain("has a fixed 2 chains (Mid, Side)");
    expect(await readChains(MID_SIDE)).toHaveLength(2);
  });

  it("refuses to delete a chain, as it does for any rack chain", async () => {
    const [mid] = await readChains(MULTIBAND);

    expect(
      await failure("ppal-delete", { id: mid!.id, type: "chain" }),
    ).toContain("Live has no way to delete a rack chain");
    expect(await readChains(MULTIBAND)).toHaveLength(3);
  });
});

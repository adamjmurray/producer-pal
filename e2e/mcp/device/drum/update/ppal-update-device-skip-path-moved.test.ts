// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E test for a skipped `ppal-update-device` entry whose path another target
 * of the same call re-numbered.
 *
 * Moving a chain onto a pad that already holds one changes which chain that
 * pad's `c0` names. A skip keeps the caller's path, so it adds where its own
 * chain went (or that the path was empty when the call began).
 *
 * Run with: npm run e2e:mcp -- ppal-update-device-skip-path-moved
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../../mcp-test-helpers";
import {
  createTrackWithDrumRack,
  readDrumPad,
} from "../drum-pad-test-helpers.ts";

const ctx = setupMcpTestContext();

interface Entry {
  id?: string;
  path?: string;
  ok?: false;
  detail?: string;
}

/**
 * Build a rack with one chain on C1 and one on D1.
 * @returns The rack's path, and each pad's chain id
 */
async function kitWithTwoChains(): Promise<{
  rackPath: string;
  c1Chain: string;
  d1Chain: string;
}> {
  const { rackPath } = await createTrackWithDrumRack(ctx.client!);
  const chainOf = async (pad: string): Promise<string> =>
    (await readDrumPad(ctx.client!, `${rackPath}/${pad}`)).chains![0]!.id!;

  return {
    rackPath,
    c1Chain: await chainOf("pC1"),
    d1Chain: await chainOf("pD1"),
  };
}

/**
 * Move the chains the paths name, one destination each.
 * @param path - The chains to move
 * @param toPath - Where each goes
 * @returns One entry per chain
 */
async function moveChains(path: string, toPath: string): Promise<Entry[]> {
  const entries = parseToolResult<Entry[]>(
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path, toPath },
    }),
  );

  await sleep(100);

  return entries;
}

describe("ppal-update-device skip whose chain path another move re-numbered", () => {
  it("says where the chain that wasn't moved sits now", async () => {
    const { rackPath, c1Chain, d1Chain } = await kitWithTwoChains();

    // C1's chain lands on D1 ahead of D1's own, so pD1/c0 names it by the end.
    // D1's chain is refused: no pad is the catch-all.
    const [moved, skipped] = await moveChains(
      `${rackPath}/pC1/c0,${rackPath}/pD1/c0`,
      `${rackPath}/pD1,${rackPath}/p*`,
    );

    expect(moved).toStrictEqual(
      expect.objectContaining({ id: c1Chain, path: `${rackPath}/pD1/c0` }),
    );
    expect(skipped).toStrictEqual({
      path: `${rackPath}/pD1/c0`,
      ok: false,
      detail: expect.stringContaining(
        `; that chain is now ${rackPath}/pD1/c1 (id ${d1Chain})`,
      ),
    });
  });

  it("says a path that named no chain now names one", async () => {
    const { rackPath, c1Chain } = await kitWithTwoChains();

    // pD1/c1 is past D1's one chain until C1's chain lands there.
    const [moved, skipped] = await moveChains(
      `${rackPath}/pC1/c0,${rackPath}/pD1/c1`,
      `${rackPath}/pD1,${rackPath}/pF1`,
    );

    expect(moved).toStrictEqual(expect.objectContaining({ id: c1Chain }));
    expect(skipped).toStrictEqual({
      path: `${rackPath}/pD1/c1`,
      ok: false,
      detail: expect.stringMatching(/; nothing was there when the call began$/),
    });
  });

  it("adds nothing when no move touched the skip's pad", async () => {
    const { rackPath } = await kitWithTwoChains();

    const [, skipped] = await moveChains(
      `${rackPath}/pC1/c0,${rackPath}/pD1/c0`,
      `${rackPath}/pF1,${rackPath}/p*`,
    );

    expect(skipped!.detail).not.toContain("is now");
    expect(skipped!.detail).not.toContain("when the call began");
  });
});

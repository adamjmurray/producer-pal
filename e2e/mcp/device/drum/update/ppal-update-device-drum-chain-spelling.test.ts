// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for the path `ppal-update-device` answers with inside a drum rack.
 *
 * A rack numbers its chains twice: the flat `chains` list in creation order,
 * and the pad listing grouped by pad and filtered by `in_note`. On a layered
 * pad the two disagree, so a result answering in the other numbering sends the
 * next call to a different chain.
 *
 * Mocks can't prove the two numberings diverge — that is Live's own creation
 * order — so this drives a real rack and reads the ids back.
 *
 * Run with: npm run e2e:mcp -- ppal-update-device-drum-chain-spelling
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../../mcp-test-helpers";
import { createLayeredPad, readDrumPad } from "../drum-pad-test-helpers.ts";

const ctx = setupMcpTestContext();

interface UpdateResult {
  id: string;
  path: string;
}

/**
 * Rename an object through `ppal-update-device` and return what it answered.
 * @param target - The `id` or `path` the call addresses it by
 * @param name - The name to write
 * @returns The result's id and path
 */
async function rename(
  target: { id: string } | { path: string },
  name: string,
): Promise<UpdateResult> {
  const result = parseToolResult<UpdateResult>(
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { ...target, name },
    }),
  );

  await sleep(100);

  return result;
}

describe("ppal-update-device drum chain path spelling", () => {
  it("answers a layered pad's chain in the pad spelling the call used", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);
    const layers = (await readDrumPad(ctx.client!, `${rackPath}/pD1`)).chains;
    const secondLayerId = layers?.[1]?.id;

    expect(secondLayerId).toBeDefined();

    const byPad = await rename(
      { path: `${rackPath}/pD1/c1` },
      "Second Layer By Pad",
    );

    expect(byPad).toStrictEqual({
      id: secondLayerId,
      path: `${rackPath}/pD1/c1`,
    });

    // Addressed by id the call spelled no container, so the path is derived —
    // and a drum chain derives pad-relative, the spelling that stays valid
    // longest: a layer index moves only when that pad changes, where a rack
    // index moves on any chain added or removed anywhere in the rack.
    const byId = await rename({ id: secondLayerId! }, "Second Layer By Id");

    expect(byId).toStrictEqual({
      id: secondLayerId,
      path: `${rackPath}/pD1/c1`,
    });
  });

  it("does not confuse c1 with pD1/c1", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);
    const layers = (await readDrumPad(ctx.client!, `${rackPath}/pD1`)).chains;

    // The rack's chains were created C1's first, then D1's, then the layer
    // duplicated onto D1 — so the rack's `c1` is D1's FIRST layer, where
    // `pD1/c1` is its second. Two spellings one digit apart, two chains.
    const rackC1 = await rename({ path: `${rackPath}/c1` }, "Rack Chain One");
    const padC1 = await rename({ path: `${rackPath}/pD1/c1` }, "Pad Layer Two");

    expect(rackC1.id).toBe(layers?.[0]?.id);
    expect(padC1.id).toBe(layers?.[1]?.id);
    expect(rackC1.id).not.toBe(padC1.id);

    // Still open: a chain addressed rack-relative is answered pad-relative
    // anyway, so this one spelling is not echoed. Asserted as it stands so
    // that closing the gap changes this line on purpose rather than in
    // silence — the ids above are the part that must never move.
    expect(rackC1.path).toBe(`${rackPath}/pD1/c0`);
    expect(padC1.path).toBe(`${rackPath}/pD1/c1`);
  });

  it("echoes either spelling for a device inside a layered pad's chain", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);

    const byPad = await rename(
      { path: `${rackPath}/pD1/c1/d0` },
      "Layered Simpler",
    );

    expect(byPad.path).toBe(`${rackPath}/pD1/c1/d0`);

    // A device under a drum chain derives rack-relative, unlike the chain
    // itself, and that spelling is echoed back when a call supplies it. Same
    // id throughout, or one of the two spellings is landing somewhere else.
    const byId = await rename({ id: byPad.id }, "Layered Simpler Again");

    expect(byId.id).toBe(byPad.id);
    expect(byId.path).toMatch(/^t\d+\/d\d+\/c\d+\/d0$/);
    expect(
      await rename({ path: byId.path }, "Layered Simpler Third"),
    ).toStrictEqual({ id: byPad.id, path: byId.path });
  });
});

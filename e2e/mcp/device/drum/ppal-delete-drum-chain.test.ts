// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for `ppal-delete type="chain"`.
 *
 * Live exposes no chain delete, so this parks the chain on a pad nothing else
 * uses and clears that pad. Layering a pad used to be a one-way door — the only
 * exit was deleting the whole pad — so the case that matters is removing one
 * layer and leaving the rest playing.
 *
 * Run with: npm run e2e:mcp -- ppal-delete-drum-chain
 */
import { describe, expect, it } from "vitest";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getToolWarnings,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import {
  createTrackWithDrumRack,
  readDrumPad,
} from "./drum-pad-test-helpers.ts";

const ctx = setupMcpTestContext();

interface DeleteResult {
  id: string;
  type: string;
  deleted: boolean;
}

/**
 * Build a rack whose D1 pad holds two layers, by copying C1's pad onto it.
 * @param client - Connected MCP client
 * @returns The track index
 */
async function createLayeredPad(client: Client): Promise<number> {
  const t = await createTrackWithDrumRack(client);
  const sourceId = (await readDrumPad(client, `t${t}/d0/pC1`)).id;

  await client.callTool({
    name: "ppal-duplicate",
    arguments: { type: "drum-pad", id: sourceId, toPath: `t${t}/d0/pD1` },
  });

  await sleep(200);

  expect((await readDrumPad(client, `t${t}/d0/pD1`)).chains).toHaveLength(2);

  return t;
}

describe("ppal-delete drum rack chain", () => {
  it("removes one layer and leaves the rest of the pad", async () => {
    const t = await createLayeredPad(ctx.client!);
    const before = await readDrumPad(ctx.client!, `t${t}/d0/pD1`);

    const result = parseToolResult<DeleteResult>(
      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { type: "chain", path: `t${t}/d0/pD1/c0` },
      }),
    );

    expect(result.deleted).toBe(true);

    await sleep(200);

    const after = await readDrumPad(ctx.client!, `t${t}/d0/pD1`);

    // The surviving layer is the one that was second, still on D1.
    expect(after.chains).toHaveLength(1);
    expect(after.chains?.[0]?.name).toBe(before.chains?.[1]?.name);
    expect(after.pitch).toBe("D1");
  });

  it("removes the last chain, emptying the pad", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);

    const result = parseToolResult<DeleteResult>(
      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { type: "chain", path: `t${t}/d0/pC1/c0` },
      }),
    );

    expect(result.deleted).toBe(true);

    await sleep(200);

    // An empty pad has no chains to route to, so the path no longer resolves.
    const rack = parseToolResult<{ drumPads?: { pitch: string }[] }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `t${t}/d0`, include: ["drum-pads"] },
      }),
    );

    expect(rack.drumPads?.map((p) => p.pitch)).not.toContain("C1");
  });

  it("refuses a bare pad path, pointing at the whole-pad delete", async () => {
    const t = await createLayeredPad(ctx.client!);

    const warnings = getToolWarnings(
      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { type: "chain", path: `t${t}/d0/pD1` },
      }),
    );

    expect(warnings).toContainEqual(
      expect.stringContaining('use type="drum-pad"'),
    );

    await sleep(200);

    expect(
      (await readDrumPad(ctx.client!, `t${t}/d0/pD1`)).chains,
    ).toHaveLength(2);
  });

  it("refuses a chain of an Instrument Rack", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);

    // Wrap the Drum Rack so there is an Instrument Rack chain to aim at.
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${t}/d0`, wrapInRack: true },
    });

    await sleep(200);

    const warnings = getToolWarnings(
      await ctx.client!.callTool({
        name: "ppal-delete",
        arguments: { type: "chain", path: `t${t}/d0/c0` },
      }),
    );

    expect(warnings).toContainEqual(
      expect.stringContaining("is not on a drum pad"),
    );

    await sleep(200);

    // The wrapped Drum Rack is still in there.
    expect(
      (await readDrumPad(ctx.client!, `t${t}/d0/c0/d0/pC1`)).chains,
    ).toHaveLength(1);
  });
});

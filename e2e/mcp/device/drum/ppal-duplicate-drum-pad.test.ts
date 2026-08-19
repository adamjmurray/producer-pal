// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for `ppal-duplicate type:"drum-pad"`.
 *
 * A pad copy exists because a device-level copy can't reliably carry chain
 * state: the trim, pan, sends, and choke group belong to the chain the device
 * sits in. This proves Live's `copy_pad` brings all of it, and that copying onto
 * an occupied pad layers rather than replaces.
 *
 * Run with: npm run e2e:mcp -- ppal-duplicate-drum-pad
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import {
  createTrackWithDrumRack,
  readDrumPad,
} from "./drum-pad-test-helpers.ts";

const ctx = setupMcpTestContext();

describe("ppal-duplicate drum-pad", () => {
  it("copies a pad's chain state and devices to an empty pad", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);

    // Mark the source chain so the copy is identifiable by more than position.
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        path: `t${t}/d0/pC1/c0`,
        name: "KickSource",
        pan: -0.4,
        chokeGroup: 2,
      },
    });

    await sleep(150);

    const sourceId = (await readDrumPad(ctx.client!, `t${t}/d0/pC1`)).id;

    const copied = parseToolResult<{ id: string; path: string }>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "drum-pad",
          id: sourceId,
          toPath: `t${t}/d0/pE1`,
        },
      }),
    );

    expect(copied.path).toBe(`t${t}/d0/pE1`);

    await sleep(150);

    const pad = await readDrumPad(ctx.client!, `t${t}/d0/pE1`);
    const chain = pad.chains?.[0];

    expect(pad.id).toBe(copied.id);
    expect(chain?.name).toBe("KickSource");
    expect(chain?.pan).toBeCloseTo(-0.4, 2);
    expect(chain?.chokeGroup).toBe(2);
    expect(chain?.devices).toHaveLength(1);

    // The source is untouched — this is a copy, not a move.
    const source = await readDrumPad(ctx.client!, `t${t}/d0/pC1`);

    expect(source.chains).toHaveLength(1);
    expect(source.chains?.[0]?.name).toBe("KickSource");
  });

  it("layers onto an occupied pad instead of replacing it", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);

    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${t}/d0/pD1/c0`, name: "Resident" },
    });

    await sleep(150);

    const sourceId = (await readDrumPad(ctx.client!, `t${t}/d0/pC1`)).id;

    await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "drum-pad",
        id: sourceId,
        toPath: `t${t}/d0/pD1`,
        name: "Layered",
      },
    });

    await sleep(150);

    // D1 already had its own chain, so it now plays both.
    const pad = await readDrumPad(ctx.client!, `t${t}/d0/pD1`);

    expect(pad.chains).toHaveLength(2);

    // read-device numbers a pad's chains the way its `/cN` paths resolve — the
    // rack's order, where a copied-on layer comes first. Naming only the new
    // chain relies on picking the right one out of that list: if it picked
    // wrong, the resident chain would be the one renamed.
    expect(pad.chains?.map((c) => c.name)).toStrictEqual([
      "Layered",
      "Resident",
    ]);
  });

  it("copies to several pads in one call and names each copy", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);

    const sourceId = (await readDrumPad(ctx.client!, `t${t}/d0/pC1`)).id;

    const results = parseToolResult<{ path: string }[]>(
      await ctx.client!.callTool({
        name: "ppal-duplicate",
        arguments: {
          type: "drum-pad",
          id: sourceId,
          toPath: `t${t}/d0/pE1,t${t}/d0/pF1`,
          name: "KickA,KickB",
        },
      }),
    );

    expect(results.map((r) => r.path)).toStrictEqual([
      `t${t}/d0/pE1`,
      `t${t}/d0/pF1`,
    ]);

    await sleep(150);

    expect(
      (await readDrumPad(ctx.client!, `t${t}/d0/pE1`)).chains?.[0]?.name,
    ).toBe("KickA");
    expect(
      (await readDrumPad(ctx.client!, `t${t}/d0/pF1`)).chains?.[0]?.name,
    ).toBe("KickB");
  });

  it("skips an empty source pad with a warning", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);

    const emptyId = (await readDrumPad(ctx.client!, `t${t}/d0/pA1`)).id;

    const result = await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "drum-pad",
        id: emptyId,
        toPath: `t${t}/d0/pE1`,
      },
    });

    expect(JSON.stringify(result)).toContain("is empty");

    await sleep(150);

    expect(
      (await readDrumPad(ctx.client!, `t${t}/d0/pE1`)).chains ?? [],
    ).toHaveLength(0);
  });
});

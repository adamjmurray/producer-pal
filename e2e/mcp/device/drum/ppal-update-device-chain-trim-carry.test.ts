// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for what happens to a drum chain's trim when only the device moves.
 *
 * The fader belongs to the chain, not the device, so a device-level move used to
 * strand it: the sound arrived at the new pad playing at unity. Moving to an
 * empty pad auto-creates the destination chain, so writing its fader re-levels
 * nothing and the trim now follows the sound. A chain that already holds devices
 * keeps its own fader and warns instead.
 *
 * Run with: npm run e2e:mcp -- ppal-update-device-chain-trim-carry
 */
import { describe, expect, it } from "vitest";
import { setupMcpTestContext, sleep } from "../../mcp-test-helpers";
import {
  createTrackWithDrumRack,
  readDrumPad,
} from "./drum-pad-test-helpers.ts";

const ctx = setupMcpTestContext();

describe("ppal-update-device drum chain trim carry", () => {
  it("carries the trim when the device moves to an empty pad", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);

    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${t}/d0/pC1/c0`, gainDb: -15, pan: -0.4 },
    });

    await sleep(150);

    // Move the device alone — E1 is empty, so its chain is created by this call.
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${t}/d0/pC1/d0`, toPath: `t${t}/d0/pE1` },
    });

    await sleep(200);

    const destination = (await readDrumPad(ctx.client!, `t${t}/d0/pE1`))
      .chains?.[0];

    expect(destination?.devices).toHaveLength(1);
    expect(destination?.gainDb).toBe(-15);
    expect(destination?.pan).toBeCloseTo(-0.4, 2);
  });

  it("leaves the trim behind and warns when the destination chain has devices", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);

    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${t}/d0/pC1/c0`, gainDb: -15 },
    });

    // D1 already holds its own device and its own trim.
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${t}/d0/pD1/c0`, gainDb: 6 },
    });

    await sleep(150);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${t}/d0/pC1/d0`, toPath: `t${t}/d0/pD1` },
    });

    expect(JSON.stringify(result)).toContain("stays behind");

    await sleep(200);

    // D1's own fader is untouched — what was already there still sounds the same.
    expect(
      (await readDrumPad(ctx.client!, `t${t}/d0/pD1`)).chains?.[0]?.gainDb,
    ).toBe(6);
  });

  it("refuses a pad move whose toPath names a different rack", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `t${t}/d0/pC1`, toPath: `t${t + 50}/d0/pB1` },
    });

    expect(JSON.stringify(result)).toContain("names a different rack");

    await sleep(200);

    // The pad stayed on C1 rather than landing on B1 of its own rack.
    expect(
      (await readDrumPad(ctx.client!, `t${t}/d0/pC1`)).chains ?? [],
    ).toHaveLength(1);
    expect(
      (await readDrumPad(ctx.client!, `t${t}/d0/pB1`)).chains ?? [],
    ).toHaveLength(0);
  });
});

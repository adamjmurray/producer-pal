// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for `ppal-update-device` on a bare drum pad path.
 *
 * A pad path used to write to the pad's first chain only, so on a layered pad —
 * several chains sharing one in_note — the other layers were silently left
 * behind. Pad-wide properties now reach every layer; the per-layer mixer
 * settings are skipped with a warning naming the layer paths, because one
 * absolute value written to every layer flattens the balance between them.
 *
 * Run with: npm run e2e:mcp -- ppal-update-device-layered-pad
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import {
  createLayeredPad,
  createTrackWithDrumRack,
  readDrumPad,
} from "./drum-pad-test-helpers.ts";

const ctx = setupMcpTestContext();

interface PadUpdateResult {
  id?: string;
  path?: string;
  chainIds?: string[];
}

describe("ppal-update-device layered drum pad", () => {
  // By id as well as by path: read-device reports drumPads[].id, so the id has
  // to reach the same whole-pad update the pad's own path does.
  it.each(["path", "id"])(
    "broadcasts the pad-wide properties to every layer, by %s",
    async (addressedBy) => {
      const { rackPath, padId } = await createLayeredPad(ctx.client!);
      const target =
        addressedBy === "id" ? { id: padId } : { path: `${rackPath}/pD1` };

      const result = parseToolResult<PadUpdateResult>(
        await ctx.client!.callTool({
          name: "ppal-update-device",
          arguments: { ...target, chokeGroup: 4, mappedPitch: "C3" },
        }),
      );

      expect(result.id).toBe(padId);
      expect(result.chainIds).toHaveLength(2);

      await sleep(200);

      const pad = await readDrumPad(ctx.client!, `${rackPath}/pD1`);

      expect(pad.chains?.map((c) => c.chokeGroup)).toStrictEqual([4, 4]);
      expect(pad.chains?.map((c) => c.mappedPitch)).toStrictEqual(["C3", "C3"]);
    },
  );

  // The pad path moves the whole pad; the id used to warn "cannot move DrumPad"
  // and report success anyway.
  it("moves the whole pad through the DrumPad id", async () => {
    const { rackPath, padId } = await createLayeredPad(ctx.client!);

    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { id: padId, toPath: `${rackPath}/pF1` },
    });

    await sleep(200);

    expect(
      (await readDrumPad(ctx.client!, `${rackPath}/pF1`)).chains,
    ).toHaveLength(2);
    expect(
      (await readDrumPad(ctx.client!, `${rackPath}/pD1`)).chains ?? [],
    ).toHaveLength(0);
  });

  it("mutes the whole pad through the DrumPad object", async () => {
    const { rackPath, padId } = await createLayeredPad(ctx.client!);

    const result = parseToolResult<PadUpdateResult>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { path: `${rackPath}/pD1`, mute: true },
      }),
    );

    // Only the pad was written to, so no chains are reported.
    expect(result).toStrictEqual({ id: padId, path: `${rackPath}/pD1` });

    await sleep(200);

    const pad = await readDrumPad(ctx.client!, `${rackPath}/pD1`);

    // Live broadcasts a pad's mute down to its chains.
    expect(pad.state).toBe("muted");
    expect(pad.chains?.map((c) => c.state)).toStrictEqual(["muted", "muted"]);
  });

  it("skips the per-layer settings and names the layer paths", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);

    const before = await readDrumPad(ctx.client!, `${rackPath}/pD1`);

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: `${rackPath}/pD1`, gainDb: -6, name: "Both" },
    });

    // The warning is the retry: it hands back the exact paths to reissue on.
    expect(JSON.stringify(result)).toContain(
      `${rackPath}/pD1/c0, ${rackPath}/pD1/c1`,
    );

    await sleep(200);

    const after = await readDrumPad(ctx.client!, `${rackPath}/pD1`);

    expect(after.chains?.map((c) => c.gainDb)).toStrictEqual(
      before.chains?.map((c) => c.gainDb),
    );
    expect(after.chains?.map((c) => c.name)).toStrictEqual(
      before.chains?.map((c) => c.name),
    );
  });

  it("still applies the per-layer settings to a single-layer pad", async () => {
    const { rackPath } = await createTrackWithDrumRack(ctx.client!);

    const result = parseToolResult<PadUpdateResult>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { path: `${rackPath}/pC1`, gainDb: -6, name: "Kick" },
      }),
    );

    expect(result.chainIds).toHaveLength(1);

    await sleep(200);

    const chain = (await readDrumPad(ctx.client!, `${rackPath}/pC1`))
      .chains?.[0];

    expect(chain?.gainDb).toBe(-6);
    expect(chain?.name).toBe("Kick");
  });
});

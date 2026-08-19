// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for `ppal-select` on a drum pad or a rack chain.
 *
 * Live keeps this selection on the rack's own view, not the song view, so
 * these read those properties back through ppal-live-api — nothing else can
 * see them. Two of them only matter in Live's UI: the scroll position, because
 * Live does not scroll to the pad it is told to select, and
 * is_showing_chain_devices, because a chain inside a collapsed rack stays
 * hidden even once it is the selected one.
 *
 * Run with: npm run e2e:mcp -- ppal-select-drum-pad
 */
import { beforeEach, describe, expect, it } from "vitest";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";
import {
  createTrackWithDrumRack,
  readDrumPad,
} from "./drum-pad-test-helpers.ts";

const ctx = setupMcpTestContext();

interface SelectRackResult {
  selectedDrumPad?: { id: string; path: string };
  selectedChain?: { id: string; path: string };
}

interface LiveApiResult {
  results: { result: unknown }[];
}

/**
 * Read a rack's view properties, which no Producer Pal tool reports.
 * @param client - Connected MCP client
 * @param rackPath - Live API path of the rack device
 * @returns selected_drum_pad, selected_chain, the chain-devices flag, and the scroll row
 */
async function readRackView(
  client: Client,
  rackPath: string,
): Promise<{
  selectedPadId: string;
  selectedChainId: string;
  showingChainDevices: number;
  scroll: number;
}> {
  const result = parseToolResult<LiveApiResult>(
    await client.callTool({
      name: "ppal-live-api",
      arguments: {
        path: `${rackPath} view`,
        operations: [
          { type: "get", property: "selected_drum_pad" },
          { type: "get", property: "selected_chain" },
          { type: "get", property: "is_showing_chain_devices" },
          { type: "get", property: "drum_pads_scroll_position" },
        ],
      },
    }),
  );
  const values = result.results.map((r) => r.result as unknown[]);

  return {
    selectedPadId: String(values[0]?.[1]),
    selectedChainId: String(values[1]?.[1]),
    showingChainDevices: Number(values[2]?.[0]),
    scroll: Number(values[3]?.[0]),
  };
}

describe("ppal-select inside a rack", () => {
  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
  });

  it("selects a drum pad by path and scrolls it into view", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);
    const padId = (await readDrumPad(ctx.client!, `t${t}/d0/pC1`)).id;

    // Park the grid somewhere else first, so the scroll write is visible.
    await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: `live_set tracks ${t} devices 0 view`,
        operations: [
          { type: "set", property: "drum_pads_scroll_position", value: 0 },
        ],
      },
    });

    const result = parseToolResult<SelectRackResult>(
      await ctx.client!.callTool({
        name: "ppal-select",
        arguments: { path: `t${t}/d0/pC1` },
      }),
    );

    expect(result.selectedDrumPad).toStrictEqual({
      id: padId,
      path: `t${t}/d0/pC1`,
    });

    await sleep(200);

    const view = await readRackView(
      ctx.client!,
      `live_set tracks ${t} devices 0`,
    );

    expect(view.selectedPadId).toBe(padId);
    expect(view.showingChainDevices).toBe(1);
    // C1 is note 36, row 9; select puts it one row down from the top.
    expect(view.scroll).toBe(8);
  });

  it("selects a drum pad by id", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);
    const padId = (await readDrumPad(ctx.client!, `t${t}/d0/pD1`)).id;

    const result = parseToolResult<SelectRackResult>(
      await ctx.client!.callTool({
        name: "ppal-select",
        arguments: { id: padId },
      }),
    );

    expect(result.selectedDrumPad?.id).toBe(padId);
    expect(result.selectedDrumPad?.path).toBe(`t${t}/d0/pD1`);

    await sleep(200);

    const view = await readRackView(
      ctx.client!,
      `live_set tracks ${t} devices 0`,
    );

    expect(view.selectedPadId).toBe(padId);
  });

  it("selects a pad layer, and the pad it sounds on", async () => {
    const t = await createTrackWithDrumRack(ctx.client!);
    const padId = (await readDrumPad(ctx.client!, `t${t}/d0/pD1`)).id;

    const result = parseToolResult<SelectRackResult>(
      await ctx.client!.callTool({
        name: "ppal-select",
        arguments: { path: `t${t}/d0/pD1/c0` },
      }),
    );

    expect(result.selectedChain).toBeDefined();
    expect(result.selectedDrumPad).toBeUndefined();

    await sleep(200);

    const view = await readRackView(
      ctx.client!,
      `live_set tracks ${t} devices 0`,
    );

    expect(view.selectedChainId).toBe(result.selectedChain!.id);
    // The layer's own pad, so Live shows the chain under the right pad.
    expect(view.selectedPadId).toBe(padId);
  });
});

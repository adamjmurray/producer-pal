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
  type TrackDrumRack,
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

/** The rack view properties no Producer Pal tool reports. */
interface RackView {
  selectedPadId: string;
  selectedChainId: string;
  showingChainDevices: number;
  scroll: number;
}

/**
 * The LiveAPI path of a rack, which ppal-live-api takes in place of a Producer
 * Pal one.
 * @param kit - The track and rack under test
 * @returns The rack's LiveAPI path
 */
function liveApiRack({ trackIndex, deviceIndex }: TrackDrumRack): string {
  return `live_set tracks ${trackIndex} devices ${deviceIndex}`;
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
): Promise<RackView> {
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

/**
 * Select something by id or path and read back what ppal-select reports.
 * @param args - ppal-select arguments
 * @returns The tool's report of what is now selected
 */
async function select(
  args: Record<string, unknown>,
): Promise<SelectRackResult> {
  return parseToolResult<SelectRackResult>(
    await ctx.client!.callTool({ name: "ppal-select", arguments: args }),
  );
}

/**
 * Let Live settle after a selection, then read the rack's view properties.
 * @param kit - The track and rack under test
 * @returns The rack view's selection, chain-devices flag, and scroll row
 */
async function rackViewAfterSelect(kit: TrackDrumRack): Promise<RackView> {
  await sleep(200);

  return readRackView(ctx.client!, liveApiRack(kit));
}

describe("ppal-select inside a rack", () => {
  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
  });

  it("selects a drum pad by path and scrolls it into view", async () => {
    const kit = await createTrackWithDrumRack(ctx.client!);
    const padId = (await readDrumPad(ctx.client!, `${kit.rackPath}/pC1`)).id;

    // Park the grid somewhere else first, so the scroll write is visible.
    await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: `${liveApiRack(kit)} view`,
        operations: [
          { type: "set", property: "drum_pads_scroll_position", value: 0 },
        ],
      },
    });

    const result = await select({ path: `${kit.rackPath}/pC1` });

    expect(result.selectedDrumPad).toStrictEqual({
      id: padId,
      path: `${kit.rackPath}/pC1`,
    });

    const view = await rackViewAfterSelect(kit);

    expect(view.selectedPadId).toBe(padId);
    expect(view.showingChainDevices).toBe(1);
    // C1 is note 36, row 9; select puts it one row down from the top.
    expect(view.scroll).toBe(8);
  });

  it("selects a drum pad by id", async () => {
    const kit = await createTrackWithDrumRack(ctx.client!);
    const padId = (await readDrumPad(ctx.client!, `${kit.rackPath}/pD1`)).id;

    const result = await select({ id: padId });

    expect(result.selectedDrumPad?.id).toBe(padId);
    expect(result.selectedDrumPad?.path).toBe(`${kit.rackPath}/pD1`);

    const view = await rackViewAfterSelect(kit);

    expect(view.selectedPadId).toBe(padId);
  });

  // Live's two chain lists disagree once a pad is layered: a copied-on layer
  // comes first in the rack's and last in the pad's. Paths resolve against the
  // rack's, so reading the pad's would reveal a layer c0 doesn't name.
  it("reveals the layer a layered pad's c0 path names", async () => {
    const kit = await createTrackWithDrumRack(ctx.client!);

    await ctx.client!.callTool({
      name: "ppal-duplicate",
      arguments: {
        type: "drum-pad",
        path: `${kit.rackPath}/pC1`,
        toPath: `${kit.rackPath}/pD1`,
        name: "CopiedLayer",
      },
    });

    await sleep(200);

    const pad = await readDrumPad(ctx.client!, `${kit.rackPath}/pD1`);

    expect(pad.chains).toHaveLength(2);

    await select({ path: `${kit.rackPath}/pD1` });

    const view = await rackViewAfterSelect(kit);

    expect(view.selectedChainId).toBe(pad.chains?.[0]?.id);
  });

  it("selects a pad layer, and the pad it sounds on", async () => {
    const kit = await createTrackWithDrumRack(ctx.client!);
    const padId = (await readDrumPad(ctx.client!, `${kit.rackPath}/pD1`)).id;

    const result = await select({ path: `${kit.rackPath}/pD1/c0` });

    expect(result.selectedChain).toBeDefined();
    expect(result.selectedDrumPad).toBeUndefined();

    const view = await rackViewAfterSelect(kit);

    expect(view.selectedChainId).toBe(result.selectedChain!.id);
    // The layer's own pad, so Live shows the chain under the right pad.
    expect(view.selectedPadId).toBe(padId);
  });
});

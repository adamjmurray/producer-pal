// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for `ppal-read-device deviceId=<drum pad id>`.
 *
 * A DrumPad carries none of the properties the device reader wants, so reading
 * one by id used to answer with a device-shaped record describing nothing.
 * These check it against the by-path read of the same pad — only real Live says
 * what a DrumPad's `type` actually is.
 *
 * Run with: npm run e2e:mcp -- ppal-read-device-drum-pad-id
 */
import { describe, expect, it } from "vitest";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parseToolResult, setupMcpTestContext } from "../../mcp-test-helpers";
import {
  type DrumPadInfo,
  createTrackWithDrumRack,
  readDrumPad,
} from "./drum-pad-test-helpers.ts";

const ctx = setupMcpTestContext();

/**
 * Read a drum pad by its id, with chains.
 * @param client - Connected MCP client
 * @param deviceId - The DrumPad's id
 * @returns The pad's info
 */
async function readDrumPadById(
  client: Client,
  deviceId: string,
): Promise<DrumPadInfo> {
  return parseToolResult<DrumPadInfo>(
    await client.callTool({
      name: "ppal-read-device",
      arguments: { id: deviceId, include: ["chains"] },
    }),
  );
}

describe("ppal-read-device with a drum pad id", () => {
  it("answers the same thing the pad's path does", async () => {
    const { rackPath } = await createTrackWithDrumRack(ctx.client!);
    const byPath = await readDrumPad(ctx.client!, `${rackPath}/pC1`);

    expect(await readDrumPadById(ctx.client!, byPath.id)).toStrictEqual(byPath);
  });

  it("hands back the path that reaches the pad", async () => {
    const { rackPath } = await createTrackWithDrumRack(ctx.client!);
    const padId = (await readDrumPad(ctx.client!, `${rackPath}/pD1`)).id;

    const pad = parseToolResult<{ path: string; pitch: string }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { id: padId },
      }),
    );

    expect(pad.path).toBe(`${rackPath}/pD1`);
    expect(pad.pitch).toBe("D1");
  });
});

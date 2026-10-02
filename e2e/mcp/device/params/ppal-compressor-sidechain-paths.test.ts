// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for naming a Compressor's sidechain source by track path (t<n>,
 * rt<n>) instead of by id.
 *
 * Run with: npm run e2e:mcp -- ppal-compressor-sidechain-paths
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

interface ParamsResult {
  parameters?: Array<{ name: string; value?: unknown }>;
}

async function createTrack(args: Record<string, unknown>): Promise<{
  id: string;
  path: string;
}> {
  const created = parseToolResult<{ id: string; path: string }>(
    await ctx.client!.callTool({ name: "ppal-create-track", arguments: args }),
  );

  await sleep(100);

  return created;
}

async function sidechainSource(compressorId: string): Promise<unknown> {
  const result = parseToolResult<ParamsResult>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: {
        id: compressorId,
        include: ["params"],
        paramSearch: "sidechainSourceTrackId",
      },
    }),
  );

  return result.parameters?.find((p) => p.name === "sidechainSourceTrackId")
    ?.value;
}

async function setSource(compressorId: string, value: string): Promise<void> {
  await ctx.client!.callTool({
    name: "ppal-update-device",
    arguments: {
      id: compressorId,
      params: [{ name: "sidechainSourceTrackId", value }],
    },
  });
  await sleep(100);
}

describe("Compressor sidechain source by path", () => {
  it("accepts a track path", async () => {
    const source = await createTrack({ type: "audio" });
    const host = await createTrack({ type: "audio" });
    const compressorId = await createTestDevice(
      ctx.client!,
      "Compressor",
      host.path,
    );

    await setSource(compressorId, source.path);

    expect(await sidechainSource(compressorId)).toBe(source.id);
  });

  it("accepts a return track path", async () => {
    const returnTrack = await createTrack({ path: "rt+" });

    // A return only becomes a routable source once it carries a device.
    await createTestDevice(ctx.client!, "Reverb", returnTrack.path);

    const host = await createTrack({ type: "audio" });
    const compressorId = await createTestDevice(
      ctx.client!,
      "Compressor",
      host.path,
    );

    await setSource(compressorId, returnTrack.path);

    expect(await sidechainSource(compressorId)).toBe(returnTrack.id);
  });
});

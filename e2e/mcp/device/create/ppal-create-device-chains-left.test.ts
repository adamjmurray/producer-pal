// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the rack chains a create-device path makes on the way when the
 * insert is then refused.
 *
 * A `c+` appends a chain before the device goes in, and Live won't take an
 * instrument in an Audio Effect Rack chain, so the chain stays behind empty.
 * The refusal has to say so.
 *
 * Run with: npm run e2e:mcp -- device/create/ppal-create-device-chains-left
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDeviceAt,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

/**
 * How many chains a rack holds right now.
 * @param rackPath - The rack's path
 * @returns The chain count
 */
async function chainCount(rackPath: string): Promise<number> {
  await sleep(150);

  const rack = parseToolResult<{ chains?: unknown[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path: rackPath, include: ["chains"] },
    }),
  );

  return rack.chains?.length ?? 0;
}

/**
 * Put an Audio Effect Rack on a new MIDI track.
 * @returns The rack's path and how many chains it starts with
 */
async function newAudioRack(): Promise<{ rack: string; before: number }> {
  const track = await createMidiTrack(ctx.client!);
  const rack = await createTestDeviceAt(
    ctx.client!,
    "Audio Effect Rack",
    `t${track}`,
  );

  return { rack, before: await chainCount(rack) };
}

describe("ppal-create-device when the insert is refused after a c+", () => {
  it("names the empty chain it left in the rack", async () => {
    const { rack, before } = await newAudioRack();

    const result = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { device: "Operator", path: `${rack}/c+` },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toMatch(
      new RegExp(
        `could not insert "Operator" at end in path "${rack}/c\\+"; left an empty chain: c${before}$`,
      ),
    );
    // The chain is really there, as the error says.
    expect(await chainCount(rack)).toBe(before + 1);
  });

  it("names it on that path's entry in a list, beside the one that landed", async () => {
    const { rack, before } = await newAudioRack();

    const result = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: {
        device: "Operator,Reverb",
        path: `${rack}/c+,${rack}/c+`,
      },
    });
    const [refused, landed] =
      parseToolResult<Array<{ ok?: boolean; detail?: string; id?: string }>>(
        result,
      );

    expect(refused?.ok).toBe(false);
    expect(refused?.detail).toMatch(/left an empty chain: c\d+$/);
    expect(landed?.id).toBeDefined();
    expect(landed).not.toHaveProperty("ok");
    // Both appended a chain, and only one of them took its device.
    expect(await chainCount(rack)).toBe(before + 2);
  });
});

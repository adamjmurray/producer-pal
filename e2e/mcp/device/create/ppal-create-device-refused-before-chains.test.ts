// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for a create-device path refused before it makes any rack chain.
 *
 * A `c+` or a `c<n>` past the last chain appends chains before the device goes
 * in, and Live won't take an instrument in an Audio Effect Rack chain. The
 * path is checked first, so the refusal leaves the rack as it was and says
 * nothing was left behind.
 *
 * Run with: npm run e2e:mcp -- device/create/ppal-create-device-refused-before-chains
 */
import { describe, expect, it } from "vitest";
import {
  createMidiTrack,
  createTestDeviceAt,
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers";
import { readChainCount } from "../helpers/chain-count-test-helpers";

const ctx = setupMcpTestContext();

const chainCount = (rackPath: string): Promise<number> =>
  readChainCount(ctx.client!, rackPath);

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

/**
 * Run a create-device call that must be refused.
 * @param deviceName - Device to create
 * @param path - Insertion path
 * @returns The refusal
 */
async function createFails(deviceName: string, path: string): Promise<string> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-device",
    arguments: { deviceName, path },
  });

  expect(isToolError(result)).toBe(true);

  return getToolErrorMessage(result);
}

describe("ppal-create-device refuses before making a chain", () => {
  it("refuses an instrument into the chain a c+ would make, leaving the rack alone", async () => {
    const { rack, before } = await newAudioRack();

    const message = await createFails("Operator", `${rack}/c+`);

    // An audio effect rack's chain takes only audio effects, and says so. The
    // chain isn't there to have an id.
    expect(message).toMatch(
      new RegExp(
        `^Error: chain ${rack}/c${before} takes only audio effects; "Operator" is an instrument$`,
      ),
    );
    expect(await chainCount(rack)).toBe(before);
  });

  it("refuses a MIDI effect into a chain a c<n> past the last would make", async () => {
    const { rack, before } = await newAudioRack();
    const last = before + 2;

    const message = await createFails("Arpeggiator", `${rack}/c${last}/d+`);

    expect(message).toMatch(
      new RegExp(
        `^Error: chain ${rack}/c${last} takes only audio effects; "Arpeggiator" is a MIDI effect$`,
      ),
    );
    expect(await chainCount(rack)).toBe(before);
  });

  it("refuses an index past the end of a chain the path would make", async () => {
    const { rack, before } = await newAudioRack();

    const message = await createFails("Compressor", `${rack}/c${before}/d3`);

    expect(message).toContain(
      `"${rack}/c${before}/d3" is past the end of a container holding 0 devices`,
    );
    expect(await chainCount(rack)).toBe(before);
  });

  it("refuses a container missing below a chain the path would make", async () => {
    const { rack, before } = await newAudioRack();
    const path = `${rack}/c${before}/d0/c0/d+`;

    const message = await createFails("Compressor", path);

    expect(message).toContain(`Device in path "${path}" does not exist`);
    expect(await chainCount(rack)).toBe(before);
  });

  it("refuses only the entry that can't land in a list, beside the one that does", async () => {
    const { rack, before } = await newAudioRack();

    const result = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: {
        deviceName: "Operator,Reverb",
        path: `${rack}/c+,${rack}/c+`,
      },
    });
    const [refused, landed] =
      parseToolResult<Array<{ ok?: boolean; detail?: string; id?: string }>>(
        result,
      );

    expect(refused?.ok).toBe(false);
    expect(refused?.detail).toMatch(/takes only audio effects/);
    expect(refused?.detail).not.toMatch(/left/);
    expect(landed?.id).toBeDefined();
    expect(landed).not.toHaveProperty("ok");
    // Only the one that took its device made a chain.
    expect(await chainCount(rack)).toBe(before + 1);
  });
});

describe("ppal-create-device when Live refuses after a pad's write made a chain", () => {
  // A pad path isn't checked up front, so an instrument into the new chain of
  // an Audio Effect Rack inside a pad is only refused once the chain exists,
  // and the refusal says so.
  it("names the empty chain it left in a rack inside a pad", async () => {
    const track = await createMidiTrack(ctx.client!);
    const drum = await createTestDeviceAt(
      ctx.client!,
      "Drum Rack",
      `t${track}`,
    );
    const rack = await createTestDeviceAt(
      ctx.client!,
      "Audio Effect Rack",
      `${drum}/pC1`,
    );
    const before = await chainCount(rack);

    const message = await createFails("Operator", `${rack}/c+`);

    expect(message).toMatch(
      /takes only audio effects; "Operator" is an instrument; left an empty chain: c\d+$/,
    );
    expect(await chainCount(rack)).toBe(before + 1);
  });
});

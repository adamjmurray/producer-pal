// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the drum-pad sample pseudo-param (path-prefixed params).
 * Builds Drum Racks and loads samples per pad, exercising the auto-create
 * Simpler behavior and the DrumSampler stop-gap against real Ableton Live.
 *
 * Run with: npm run e2e:mcp -- ppal-create-device-drum-kit
 */
import { describe, expect, it } from "vitest";
import {
  KICK_FILE,
  SAMPLE_FILE,
  parseToolResult,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

interface CreateTrackResult {
  id: string;
  trackIndex: number;
}

interface ReadDeviceResult {
  id: string;
  type: string;
  sample?: string;
}

/**
 * Create a fresh empty MIDI track and return its index.
 * @returns The new track's index
 */
async function createMidiTrack(): Promise<number> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-track",
    arguments: { type: "midi" },
  });
  const track = parseToolResult<CreateTrackResult>(result);

  await sleep(100);

  return track.trackIndex;
}

/**
 * Create a fresh MIDI track carrying an empty Drum Rack.
 * @returns The new track's index (its rack sits at `t<index>/d0`)
 */
async function createTrackWithDrumRack(): Promise<number> {
  const t = await createMidiTrack();

  await ctx.client!.callTool({
    name: "ppal-create-device",
    arguments: { deviceName: "Drum Rack", path: `t${t}` },
  });

  await sleep(100);

  return t;
}

/** Read a device's chains (maxDepth 0) and return how many chains it has. */
async function readChainCount(path: string): Promise<number> {
  const device = parseToolResult<{ chains?: unknown[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path, include: ["chains"], maxDepth: 0 },
    }),
  );

  return device.chains?.length ?? 0;
}

describe("ppal-create-device drum kit (path-prefixed sample params)", () => {
  it("builds a kit in one call: auto-creates each pad's Simpler and loads its sample", async () => {
    const t = await createMidiTrack();

    await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: {
        deviceName: "Drum Rack",
        path: `t${t}`,
        params: [
          { name: "pC1/d0/sample", value: KICK_FILE },
          { name: "pC#1/d0/sample", value: SAMPLE_FILE },
          { name: "pC1/d0/gainDb", value: "-6" },
        ],
      },
    });

    await sleep(150);

    // These reads spell out the chain (pC1/c0/d0), but the implicit-chain form
    // (pC1/d0 == pC1/c0/d0) works for reads too — read-device and the write side
    // accept the same drum-pad paths (see readDrumPadNestedTarget). No asymmetry.

    // C1 pad: kick sample loaded into an auto-created Simpler.
    const kickPad = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `t${t}/d0/pC1/c0/d0`, include: ["sample"] },
      }),
    );

    expect(kickPad.type).toContain("Simpler");
    expect(kickPad.sample).toContain("kick.aiff");

    // C#1 pad: the other sample.
    const snarePad = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `t${t}/d0/pC#1/c0/d0`, include: ["sample"] },
      }),
    );

    expect(snarePad.type).toContain("Simpler");
    expect(snarePad.sample).toContain("sample.aiff");

    // gainDb (listed after the sample) applied to the C1 pad's Simpler.
    const kickParams = parseToolResult<{ parameters: { name: string }[] }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `t${t}/d0/pC1/c0/d0`, include: ["params"] },
      }),
    );
    const gainEntry = kickParams.parameters.find(
      (p: { name: string; value?: unknown }) => p.name === "gainDb",
    ) as { value?: number } | undefined;

    expect(gainEntry?.value).toBeCloseTo(-6, 0);
  });

  it("update-device path-prefixed params set a sample on an existing rack", async () => {
    const t = await createTrackWithDrumRack();

    // Load a sample into pad D1 via update-device.
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        path: `t${t}/d0`,
        params: [{ name: "pD1/d0/sample", value: KICK_FILE }],
      },
    });

    await sleep(150);

    const pad = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `t${t}/d0/pD1/c0/d0`, include: ["sample"] },
      }),
    );

    expect(pad.type).toContain("Simpler");
    expect(pad.sample).toContain("kick.aiff");
  });

  it("skips a sample write onto a DrumSampler pad, and replaces it under force", async () => {
    const t = await createTrackWithDrumRack();

    // Put a DrumSampler on pad E1.
    await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "DrumSampler", path: `t${t}/d0/pE1/d0` },
    });

    await sleep(150);

    // Confirm the pad holds a DrumSampler. The display name may be "DrumSampler"
    // or "Drum Sampler" across Live versions — "Sampler" matches both and
    // excludes "Simpler", which is what the lenient class match relies on.
    const before = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `t${t}/d0/pE1/c0/d0` },
      }),
    );

    expect(before.type).toContain("Sampler");

    // Honoring the write means replacing the DrumSampler, losing its settings,
    // so it warn-skips and names force:true as the way through.
    const skipped = parseToolResultWithWarnings(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: {
          path: `t${t}/d0`,
          params: [{ name: "pE1/d0/sample", value: KICK_FILE }],
        },
      }),
    );

    expect(skipped.warnings.join("\n")).toContain("sample write SKIPPED");
    expect(skipped.warnings.join("\n")).toContain("force:true");

    await sleep(150);

    const kept = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `t${t}/d0/pE1/c0/d0` },
      }),
    );

    expect(kept.type).not.toContain("Simpler");

    const forced = parseToolResultWithWarnings(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: {
          path: `t${t}/d0`,
          params: [{ name: "pE1/d0/sample", value: KICK_FILE }],
          force: true,
        },
      }),
    );

    expect(forced.warnings.join("\n")).toContain("force:true");

    await sleep(150);

    const after = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `t${t}/d0/pE1/c0/d0`, include: ["sample"] },
      }),
    );

    expect(after.type).toContain("Simpler");
    expect(after.sample).toContain("kick.aiff");
  });

  it("refuses a drum-pad sample write on a non-drum rack and strands no chain", async () => {
    const t = await createMidiTrack();

    // A plain Instrument Rack: chain-capable but NOT a Drum Rack
    // (can_have_chains true, can_have_drum_pads false). A pad path aimed at it
    // must warn-skip before insert_chain, or an empty chain gets stranded in the
    // wrong rack (the C2 guard in resolveOrCreateDrumPadChain).
    await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName: "Instrument Rack", path: `t${t}` },
    });

    await sleep(150);

    const beforeChainCount = await readChainCount(`t${t}/d0`);

    const { warnings } = parseToolResultWithWarnings(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: {
          path: `t${t}/d0`,
          params: [{ name: "pC1/d0/sample", value: KICK_FILE }],
        },
      }),
    );

    expect(warnings.join("\n")).toContain(
      "could not resolve or create drum pad",
    );

    await sleep(150);

    // No stray chain: the guard refused before insert_chain.
    expect(await readChainCount(`t${t}/d0`)).toBe(beforeChainCount);
  });
});

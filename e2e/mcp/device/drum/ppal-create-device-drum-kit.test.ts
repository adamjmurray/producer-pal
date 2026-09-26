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
import { beforeAll, describe, expect, it } from "vitest";
import {
  KICK_FILE,
  SAMPLE_FILE,
  createTestDeviceAt,
  parseToolResult,
  getToolErrorMessage,
  getToolWarnings,
  isToolError,
  parseToolResultWithWarnings,
  setupMcpTestContext,
  sleep,
  trackIndexFromPath,
} from "../../mcp-test-helpers";
import { supportsSampleLoading } from "../../workflow/helpers/server-capability-test-helpers";

const ctx = setupMcpTestContext({ once: true });

// Live 12.3 has no Simpler.replace_sample. Everything else here is
// version-independent, so assert the honest warn-skip rather than skipping.
let canLoadSamples = true;

beforeAll(async () => {
  canLoadSamples = await supportsSampleLoading(ctx.client!);
});

interface CreateTrackResult {
  id: string;
  path: string;
}

interface CreateDeviceResult {
  path: string;
}

interface ReadDeviceResult {
  id: string;
  type: string;
  sample?: string;
}

interface UpdateDeviceResult {
  detail?: string;
  params?: Array<{
    name: string;
    value?: unknown;
    ok?: boolean;
    detail?: string;
  }>;
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

  return trackIndexFromPath(track.path);
}

/**
 * Create a fresh MIDI track carrying an empty Drum Rack.
 * @returns The rack's path — a default track preset decides its index
 */
async function createTrackWithDrumRack(): Promise<string> {
  const t = await createMidiTrack();
  const rack = await createTestDeviceAt(ctx.client!, "Drum Rack", `t${t}`);

  await sleep(100);

  return rack;
}

/**
 * Count what a device holds: its chains, or a Drum Rack's pads.
 * @param path - Device path
 * @param kind - Which list to count
 * @returns How many the device reports
 */
async function readContentCount(
  path: string,
  kind: "chains" | "drum-pads",
): Promise<number> {
  const device = parseToolResult<{ chains?: unknown[]; drumPads?: unknown[] }>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path, include: [kind], maxDepth: 0 },
    }),
  );

  return (kind === "chains" ? device.chains : device.drumPads)?.length ?? 0;
}

/**
 * Assert a `sample` write landed — or, on Live 12.3, that it said why and left
 * the Simpler empty instead of silently doing nothing.
 * @param said - What the call answered: its error, or its result as JSON
 * @param sample - Sample path read back from the pad
 * @param fileName - Expected sample file name
 */
function expectSampleWrite(
  said: string,
  sample: string | undefined,
  fileName: string,
): void {
  if (canLoadSamples) {
    expect(sample).toContain(fileName);

    return;
  }

  expect(said).toContain("requires Live 12.4");
  expect(sample).toBeUndefined();
}

/**
 * Call update-device with a sample write. It keeps its entry even on Live
 * 12.3, where the sample can't load: the Simpler it made or swapped in changed
 * the Set.
 * @param args - Tool arguments
 * @returns The result, its warnings, and the result as text
 */
async function updateDevice(args: Record<string, unknown>): Promise<{
  data: UpdateDeviceResult;
  warnings: string[];
  said: string;
}> {
  const answer = parseToolResultWithWarnings<UpdateDeviceResult>(
    await ctx.client!.callTool({ name: "ppal-update-device", arguments: args }),
  );

  return { ...answer, said: JSON.stringify(answer.data) };
}

describe("ppal-create-device drum kit (path-prefixed sample params)", () => {
  it("builds a kit in one call: auto-creates each pad's Simpler and loads its sample", async () => {
    const t = await createMidiTrack();

    const { data: created, warnings } =
      parseToolResultWithWarnings<CreateDeviceResult>(
        await ctx.client!.callTool({
          name: "ppal-create-device",
          arguments: {
            device: "Drum Rack",
            path: `t${t}`,
            params: [
              { name: "pC1/sample", value: KICK_FILE },
              { name: "pC#1/d0/sample", value: SAMPLE_FILE },
              { name: "pC1/d0/gainDb", value: "-6" },
            ],
          },
        }),
      );
    const rack = created.path;

    await sleep(150);

    // These reads spell out the chain (pC1/c0/d0), but the implicit-chain form
    // (pC1/d0 == pC1/c0/d0) works for reads too — read-device and the write side
    // accept the same drum-pad paths (see readDrumPadNestedTarget). No asymmetry.

    // C1 pad: kick sample loaded into an auto-created Simpler.
    const kickPad = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `${rack}/pC1/c0/d0`, include: ["sample"] },
      }),
    );

    expect(kickPad.type).toContain("Simpler");
    expectSampleWrite(JSON.stringify(created), kickPad.sample, "kick.aiff");

    // C#1 pad: the other sample.
    const snarePad = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `${rack}/pC#1/c0/d0`, include: ["sample"] },
      }),
    );

    expect(snarePad.type).toContain("Simpler");
    expectSampleWrite(JSON.stringify(created), snarePad.sample, "sample.aiff");

    // gainDb (listed after the sample) applied to the C1 pad's Simpler.
    const kickParams = parseToolResult<{ parameters: { name: string }[] }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `${rack}/pC1/c0/d0`, include: ["params"] },
      }),
    );
    const gainEntry = kickParams.parameters.find(
      (p: { name: string; value?: unknown }) => p.name === "gainDb",
    ) as { value?: number } | undefined;

    // gainDb needs a loaded sample, so it can only land where the sample did.
    if (canLoadSamples) {
      expect(gainEntry?.value).toBeCloseTo(-6, 0);
    } else {
      expect(gainEntry?.value).toBeUndefined();
    }

    // "pC1/d0/gainDb" is the general path-prefixed form, not the `sample`
    // shortcut — it still works, but is deprecated in favor of addressing the
    // Simpler by its own path.
    expect(warnings.join("\n")).toContain(
      `params name "pC1/d0/gainDb" is deprecated and will be removed; use path "${rack}/pC1/d0" with name "gainDb"`,
    );
  });

  it("update-device path-prefixed params set a sample on an existing rack", async () => {
    const rack = await createTrackWithDrumRack();

    // Load a sample into pad D1 via update-device.
    const { said } = await updateDevice({
      path: rack,
      params: [{ name: "pD1/d0/sample", value: KICK_FILE }],
    });

    await sleep(150);

    const pad = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `${rack}/pD1/c0/d0`, include: ["sample"] },
      }),
    );

    expect(pad.type).toContain("Simpler");
    expectSampleWrite(said, pad.sample, "kick.aiff");
  });

  // A pad one rack down is a pad like any other: its chain is missing, the
  // path says which chain it is, so the write makes it.
  it("loads a sample onto a pad inside a nested Drum Rack, creating its chain", async () => {
    const rack = await createTrackWithDrumRack();
    const nested = await createTestDeviceAt(
      ctx.client!,
      "Drum Rack",
      `${rack}/pC1`,
    );
    // Where the nested rack landed, spelled with the pad chain the create left
    // implicit, so the write crosses the nesting explicitly. Its device index
    // comes off the path the create returned rather than being assumed.
    const under = `pC1/c0/${nested.slice(nested.lastIndexOf("/") + 1)}`;

    await sleep(150);

    const { data, warnings, said } = await updateDevice({
      path: rack,
      params: [{ name: `${under}/pD1/sample`, value: KICK_FILE }],
    });

    expect(data.params?.[0]?.name).toBe(`${under}/pD1/sample`);

    // The pad shortcut is not the deprecated general form, one level down
    // either — the Simpler it needs still doesn't exist to be addressed.
    expect(warnings.join("\n")).not.toContain("deprecated");

    await sleep(150);

    const pad = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `${rack}/${under}/pD1/c0/d0`, include: ["sample"] },
      }),
    );

    expect(pad.type).toContain("Simpler");
    expectSampleWrite(said, pad.sample, "kick.aiff");
  });

  it("creates a device on a pad inside a nested Drum Rack", async () => {
    const rack = await createTrackWithDrumRack();
    const nested = await createTestDeviceAt(
      ctx.client!,
      "Drum Rack",
      `${rack}/pC1`,
    );

    await sleep(150);

    // E1 has no chain on the nested rack, so the insertion path has to make
    // one before the Operator has anywhere to land.
    await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { device: "Operator", path: `${nested}/pE1` },
    });

    await sleep(150);

    const pad = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `${nested}/pE1/c0/d0` },
      }),
    );

    expect(pad.type).toContain("Operator");
  });

  it("skips a sample write onto a DrumSampler pad, and replaces it under force", async () => {
    const rack = await createTrackWithDrumRack();

    // Put a DrumSampler on pad E1.
    await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { device: "DrumSampler", path: `${rack}/pE1/d0` },
    });

    await sleep(150);

    // Confirm the pad holds a DrumSampler. The display name may be "DrumSampler"
    // or "Drum Sampler" across Live versions — "Sampler" matches both and
    // excludes "Simpler", which is what the lenient class match relies on.
    const before = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `${rack}/pE1/c0/d0` },
      }),
    );

    expect(before.type).toContain("Sampler");

    // Honoring the write means replacing the DrumSampler, losing its settings,
    // so it skips and names force:true as the way through. The sample was all
    // the call asked, so the call fails.
    const skipped = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        path: rack,
        params: [{ name: "pE1/d0/sample", value: KICK_FILE }],
      },
    });

    expect(isToolError(skipped)).toBe(true);
    expect(getToolErrorMessage(skipped)).toContain(
      'no param landed — "pE1/d0/sample": sample write SKIPPED',
    );
    expect(getToolErrorMessage(skipped)).toContain("force:true");
    expect(getToolWarnings(skipped)).toStrictEqual([]);

    await sleep(150);

    const kept = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `${rack}/pE1/c0/d0` },
      }),
    );

    expect(kept.type).not.toContain("Simpler");

    const forced = await updateDevice({
      path: rack,
      params: [{ name: "pE1/d0/sample", value: KICK_FILE }],
      force: true,
    });

    // The swap is destructive, so the entry says what it cost — on Live 12.3
    // too, where the sample then can't load: the swap still happened.
    expect(forced.data.detail).toContain("force:true");
    expect(forced.warnings).toStrictEqual([]);

    await sleep(150);

    const after = parseToolResult<ReadDeviceResult>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: `${rack}/pE1/c0/d0`, include: ["sample"] },
      }),
    );

    expect(after.type).toContain("Simpler");
    expectSampleWrite(forced.said, after.sample, "kick.aiff");
  });

  it("refuses a drum-pad sample write on a non-drum rack and strands no chain", async () => {
    const t = await createMidiTrack();

    // A plain Instrument Rack: chain-capable but NOT a Drum Rack
    // (can_have_chains true, can_have_drum_pads false). A pad path aimed at it
    // must warn-skip before insert_chain, or an empty chain gets stranded in the
    // wrong rack (the C2 guard in resolveOrCreateDrumPadChain).
    const rack = await createTestDeviceAt(
      ctx.client!,
      "Instrument Rack",
      `t${t}`,
    );

    await sleep(150);

    const beforeChainCount = await readContentCount(rack, "chains");

    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        path: rack,
        params: [{ name: "pC1/sample", value: KICK_FILE }],
      },
    });

    // The sample was all the call asked, so the call fails.
    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      'no param landed — "pC1/sample": ',
    );
    expect(getToolErrorMessage(result)).toContain(
      "could not resolve or create drum pad",
    );
    expect(getToolWarnings(result)).toStrictEqual([]);

    await sleep(150);

    // No stray chain: the guard refused before insert_chain.
    expect(await readContentCount(rack, "chains")).toBe(beforeChainCount);
  });
  it("refuses to create a device on the catch-all pad and strands no chain", async () => {
    const rack = await createTrackWithDrumRack();

    // The catch-all pad is in_note -1 and Live clamps a drum chain's in_note to
    // 0-127, so there is no chain to create. Without the guard, insert_chain
    // leaves an empty chain on C1 and the lookup that follows fails anyway.
    const result = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { device: "Operator", path: `${rack}/p*` },
    });

    expect(isToolError(result)).toBe(true);

    await sleep(150);

    expect(await readContentCount(rack, "drum-pads")).toBe(0);
  });
});

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the specialized-device interface layer (pseudo-params, actions,
 * options, modulations) against real Ableton Live.
 *
 * The ~318 unit tests validate index<->label logic against mocks, but cannot
 * catch a wrong LOM property name or a reordered enum vs real Live (mocks have
 * masked exactly those bugs). These read+write round-trips exercise each
 * specialized device class against a running Live, and assert raw `_index`
 * values for Drift's mod matrix so a future Live reordering is caught.
 *
 * Run with: npm run e2e:mcp -- ppal-specialized-devices
 */
import { describe, expect, it } from "vitest";
import {
  createTestDevice,
  parseToolResult,
  parseToolResultWithWarnings,
  SAMPLE_FILE,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

interface PseudoParam {
  id?: string;
  name: string;
  value: unknown;
}

interface ModulationRoute {
  target: string;
  source: string;
  amount: number;
}

interface ReadDeviceResult {
  id: string;
  type: string;
  parameters?: PseudoParam[];
  options?: Record<string, unknown>;
  modulations?: ModulationRoute[];
}

// Reuse one Live session across the suite (each test makes its own fresh
// track/device, so accumulated state is harmless and this avoids ~9 reopens).
const ctx = setupMcpTestContext({ once: true });

/**
 * Create a fresh track of the given type and return its index.
 * Instrument tracks reject a second instrument, so each instrument test needs
 * its own clean track.
 */
async function createTrack(type: "midi" | "audio"): Promise<number> {
  const result = await ctx.client!.callTool({
    name: "ppal-create-track",
    arguments: { type },
  });
  const { trackIndex } = parseToolResult<{ trackIndex: number }>(result);

  await sleep(100);

  return trackIndex;
}

/** Create an instrument on a fresh MIDI track; returns the device id. */
async function createInstrument(deviceName: string): Promise<string> {
  const trackIndex = await createTrack("midi");

  return createTestDevice(ctx.client!, deviceName, `t${trackIndex}`);
}

/** Create an audio effect on a fresh audio track; returns the device id. */
async function createEffect(deviceName: string): Promise<string> {
  const trackIndex = await createTrack("audio");

  return createTestDevice(ctx.client!, deviceName, `t${trackIndex}`);
}

/** Read a device, optionally with includes / paramSearch. */
async function readDevice(
  deviceId: string,
  include?: string[],
  paramSearch?: string,
): Promise<ReadDeviceResult> {
  const args: Record<string, unknown> = { deviceId };

  if (include) args.include = include;
  if (paramSearch) args.paramSearch = paramSearch;

  return parseToolResult<ReadDeviceResult>(
    await ctx.client!.callTool({ name: "ppal-read-device", arguments: args }),
  );
}

/** Look up a pseudo-param value by name from a read result. */
function paramValue(device: ReadDeviceResult, name: string): unknown {
  return device.parameters?.find((p) => p.name === name)?.value;
}

/** Apply an update-device call and let Live settle. */
async function updateDevice(
  deviceId: string,
  args: Record<string, unknown>,
): Promise<void> {
  await ctx.client!.callTool({
    name: "ppal-update-device",
    arguments: { ids: deviceId, ...args },
  });

  await sleep(100);
}

describe("specialized devices: Drift", () => {
  it("round-trips mod-matrix slots and asserts the raw indices", async () => {
    // ppal-live-api is excluded from the default e2e tool whitelist; re-enable
    // so we can read the raw `_index` props and catch a reordered enum.
    await setConfig({ liveApiEnabled: true });
    await sleep(50);

    const id = await createInstrument("Drift");

    await updateDevice(id, {
      params: [
        { name: "mod1Source", value: "LFO" },
        { name: "mod1Target", value: "LP Frequency" },
      ],
    });

    const after = await readDevice(id, ["params"], "mod1");

    expect(paramValue(after, "mod1Source")).toBe("LFO");
    expect(paramValue(after, "mod1Target")).toBe("LP Frequency");

    // Raw indices (SOURCES[2]="LFO", TARGETS[6]="LP Frequency") — the
    // authoritative check that our hardcoded enum order matches Live.
    const raw = parseToolResult<{
      results: Array<{ result: number }>;
    }>(
      await ctx.client!.callTool({
        name: "ppal-live-api",
        arguments: {
          path: `id ${id}`,
          operations: [
            { type: "getProperty", property: "mod_matrix_source_1_index" },
            { type: "getProperty", property: "mod_matrix_target_1_index" },
          ],
        },
      }),
    );

    expect(raw.results[0]!.result).toBe(2);
    expect(raw.results[1]!.result).toBe(6);
  });

  it("validates pitchBendRange (Live reverts out-of-range, does not clamp)", async () => {
    const id = await createInstrument("Drift");

    await updateDevice(id, {
      params: [{ name: "pitchBendRange", value: "12" }],
    });
    expect(
      paramValue(
        await readDevice(id, ["params"], "pitchBendRange"),
        "pitchBendRange",
      ),
    ).toBe(12);

    // 13 is out of range (max 12). Live silently reverts, so we warn-and-skip
    // rather than write — the value must stay at 12. See AJM-389.
    const { warnings } = parseToolResultWithWarnings(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: {
          ids: id,
          params: [{ name: "pitchBendRange", value: "13" }],
        },
      }),
    );

    await sleep(100);

    expect(warnings.some((w) => w.includes("pitchBendRange"))).toBe(true);
    expect(
      paramValue(
        await readDevice(id, ["params"], "pitchBendRange"),
        "pitchBendRange",
      ),
    ).toBe(12);
  });

  it("round-trips voiceCount (index-mapped catalog value)", async () => {
    const id = await createInstrument("Drift");

    await updateDevice(id, { params: [{ name: "voiceCount", value: "16" }] });

    expect(
      paramValue(await readDevice(id, ["params"], "voiceCount"), "voiceCount"),
    ).toBe(16);
  });
});

describe("specialized devices: Wavetable", () => {
  it("exposes category/wavetable/modulatable catalogs via options", async () => {
    const id = await createInstrument("Wavetable");
    const { options } = await readDevice(id, ["options"]);

    expect(Array.isArray(options?.oscWavetableCategories)).toBe(true);
    expect(
      (options?.oscWavetableCategories as string[]).length,
    ).toBeGreaterThan(0);
    expect((options?.osc1Wavetables as string[]).length).toBeGreaterThan(0);
    expect(options?.modulatableParameters as string[]).toContain("Flt 1 Freq");
  });

  it("adds and clears a modulation-matrix route", async () => {
    const id = await createInstrument("Wavetable");

    await updateDevice(id, {
      actions: ["setModulation('Flt 1 Freq','LFO 1',0.5)"],
    });

    const routes = (await readDevice(id, ["options"])).modulations ?? [];
    const route = routes.find(
      (r) => r.target === "Flt 1 Freq" && r.source === "LFO 1",
    );

    expect(route?.amount).toBeCloseTo(0.5, 5);

    await updateDevice(id, {
      actions: ["clearModulation('Flt 1 Freq','LFO 1')"],
    });

    const cleared = (await readDevice(id, ["options"])).modulations ?? [];

    expect(
      cleared.some((r) => r.target === "Flt 1 Freq" && r.source === "LFO 1"),
    ).toBe(false);
  });

  it("round-trips osc category + wavetable (category scopes the list)", async () => {
    const id = await createInstrument("Wavetable");

    await updateDevice(id, {
      params: [{ name: "osc1Category", value: "Harmonics" }],
    });

    const afterCategory = await readDevice(id, ["params"], "osc1Category");

    expect(paramValue(afterCategory, "osc1Category")).toBe("Harmonics");

    // The wavetable list is scoped to the selected category; pick its first.
    const wavetables = (await readDevice(id, ["options"])).options
      ?.osc1Wavetables as string[];
    const target = wavetables[0]!;

    await updateDevice(id, {
      params: [{ name: "osc1Wavetable", value: target }],
    });

    expect(
      paramValue(
        await readDevice(id, ["params"], "osc1Wavetable"),
        "osc1Wavetable",
      ),
    ).toBe(target);
  });
});

describe("specialized devices: Compressor", () => {
  it("round-trips sidechain source + channel and clears to No Input", async () => {
    const id = await createEffect("Compressor");
    const sourceIds = (await readDevice(id, ["options"])).options
      ?.sidechainSourceTrackIds as string[];

    expect(sourceIds.length).toBeGreaterThan(0);

    const sourceId = sourceIds[0]!;

    // Apply source before channel — the valid channels are scoped to the
    // selected source, so set the source first, then read the catalog.
    await updateDevice(id, {
      params: [{ name: "sidechainSourceTrackId", value: sourceId }],
    });

    const channels = (await readDevice(id, ["options"])).options
      ?.sidechainChannels as string[];

    expect(channels.length).toBeGreaterThan(0);

    const channel = channels.includes("Pre FX") ? "Pre FX" : channels[0]!;

    await updateDevice(id, {
      params: [{ name: "sidechainChannel", value: channel }],
    });

    const routed = await readDevice(id, ["params"], "sidechain");

    expect(paramValue(routed, "sidechainSourceTrackId")).toBe(sourceId);
    expect(paramValue(routed, "sidechainChannel")).toBe(channel);

    await updateDevice(id, {
      params: [{ name: "sidechainSourceTrackId", value: "null" }],
    });

    expect(
      paramValue(
        await readDevice(id, ["params"], "sidechainSourceTrackId"),
        "sidechainSourceTrackId",
      ),
    ).toBeNull();
  });

  it("resolves a return-track sidechain source to its track id", async () => {
    // AJM-391: return/master sources now resolve to a track id on read (they
    // previously read back as null). A return track only becomes a routable
    // sidechain source once it carries an audio-bearing device, so give it one.
    const created = parseToolResult<{ id: string; returnTrackIndex: number }>(
      await ctx.client!.callTool({
        name: "ppal-create-track",
        arguments: { type: "return" },
      }),
    );

    await sleep(100);

    const returnTrackId = String(created.id);

    await createTestDevice(
      ctx.client!,
      "Reverb",
      `rt${created.returnTrackIndex}`,
    );

    const compId = await createEffect("Compressor");
    const sourceIds = (await readDevice(compId, ["options"])).options
      ?.sidechainSourceTrackIds as string[];

    expect(sourceIds).toContain(returnTrackId);

    await updateDevice(compId, {
      params: [{ name: "sidechainSourceTrackId", value: returnTrackId }],
    });

    expect(
      paramValue(
        await readDevice(compId, ["params"], "sidechainSourceTrackId"),
        "sidechainSourceTrackId",
      ),
    ).toBe(returnTrackId);
  });
});

describe("specialized devices: Hybrid Reverb", () => {
  it("exposes IR catalogs and round-trips category + file", async () => {
    const id = await createEffect("Hybrid Reverb");
    const { options } = await readDevice(id, ["options"]);

    expect((options?.irCategoryList as string[]).length).toBeGreaterThan(0);
    expect((options?.irFileList as string[]).length).toBeGreaterThan(0);

    await updateDevice(id, {
      params: [{ name: "irCategory", value: "Halls" }],
    });

    expect(
      paramValue(await readDevice(id, ["params"], "irCategory"), "irCategory"),
    ).toBe("Halls");

    // irFileList is scoped to the now-selected category; select its first file.
    const files = (await readDevice(id, ["options"])).options
      ?.irFileList as string[];
    const file = files[0]!;

    await updateDevice(id, { params: [{ name: "irFile", value: file }] });

    expect(
      paramValue(await readDevice(id, ["params"], "irFile"), "irFile"),
    ).toBe(file);
  });
});

describe("specialized devices: Meld", () => {
  it("round-trips polyphony pseudo-params", async () => {
    const id = await createInstrument("Meld");

    await updateDevice(id, {
      params: [
        { name: "monoPoly", value: "mono" },
        { name: "polyVoices", value: "4" },
        { name: "unisonVoices", value: "2" },
      ],
    });

    const after = await readDevice(id, ["params"]);

    expect(paramValue(after, "monoPoly")).toBe("mono");
    expect(paramValue(after, "polyVoices")).toBe(4);
    expect(paramValue(after, "unisonVoices")).toBe(2);
  });
});

describe("specialized devices: Simpler", () => {
  it("round-trips playback pseudo-params", async () => {
    const id = await createInstrument("Simpler");

    await updateDevice(id, {
      params: [
        { name: "playbackMode", value: "one-shot" },
        { name: "voices", value: "8" },
        { name: "retrigger", value: "false" },
      ],
    });

    const after = await readDevice(id, ["params"]);

    expect(paramValue(after, "playbackMode")).toBe("one-shot");
    expect(paramValue(after, "voices")).toBe(8);
    expect(paramValue(after, "retrigger")).toBe(false);
  });

  it("loads a sample and round-trips gainDb via the sample group", async () => {
    const id = await createInstrument("Simpler");

    // Two calls: the sample must be loaded before gain can be set on it.
    await updateDevice(id, {
      params: [{ name: "sample", value: SAMPLE_FILE }],
    });
    await updateDevice(id, { params: [{ name: "gainDb", value: "-6" }] });

    // include: ["sample"] returns just the sample group inside parameters[],
    // with no top-level sample/gainDb/multisample fields.
    const sampleView = await readDevice(id, ["sample"]);

    expect(String(paramValue(sampleView, "sample"))).toContain("sample.aiff");
    expect(paramValue(sampleView, "gainDb")).toBeCloseTo(-6, 0);
    expect(sampleView).not.toHaveProperty("sample");
    expect(sampleView).not.toHaveProperty("gainDb");
    expect(sampleView).not.toHaveProperty("multisample");
  });
});

describe("specialized devices: EQ Eight", () => {
  it("round-trips globalMode and oversample", async () => {
    const id = await createEffect("EQ Eight");

    await updateDevice(id, {
      params: [
        { name: "globalMode", value: "M/S" },
        { name: "oversample", value: "false" },
      ],
    });

    const after = await readDevice(id, ["params"], "global");

    expect(paramValue(after, "globalMode")).toBe("M/S");

    const full = await readDevice(id, ["params"], "oversample");

    expect(paramValue(full, "oversample")).toBe(false);
  });
});

describe("specialized devices: Roar", () => {
  it("round-trips routingMode and envListen", async () => {
    const id = await createEffect("Roar");

    await updateDevice(id, {
      params: [
        { name: "routingMode", value: "parallel" },
        { name: "envListen", value: "true" },
      ],
    });

    const after = await readDevice(id, ["params"]);

    expect(paramValue(after, "routingMode")).toBe("parallel");
    expect(paramValue(after, "envListen")).toBe(true);
  });
});

describe("specialized devices: Spectral Resonator", () => {
  it("round-trips mode/pitch/polyphony pseudo-params", async () => {
    const id = await createEffect("Spectral Resonator");

    await updateDevice(id, {
      params: [
        { name: "modMode", value: "Chorus" },
        { name: "pitchMode", value: "MIDI Note" },
        { name: "polyphony", value: "4" },
      ],
    });

    const after = await readDevice(id, ["params"]);

    expect(paramValue(after, "modMode")).toBe("Chorus");
    expect(paramValue(after, "pitchMode")).toBe("MIDI Note");
    expect(paramValue(after, "polyphony")).toBe(4);
  });
});

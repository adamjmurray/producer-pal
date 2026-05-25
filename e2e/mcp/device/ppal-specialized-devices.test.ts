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
 * values for the hardcoded enums on the no-_list devices (Drift's mod matrix +
 * voice config, Roar's routing mode) so a future Live reordering is caught.
 * Roar additionally exposes a routing_mode_list, so its catalog is checked
 * against Live's authoritative list (a non-circular guard). See AJM-397.
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
  unit?: string;
}

interface ModulationRoute {
  target: string;
  source: string;
  amount: number;
}

interface ActionInfo {
  name: string;
  signature: string;
  description: string;
}

interface ReadDeviceResult {
  id: string;
  type: string;
  sample?: string;
  parameters?: PseudoParam[];
  options?: Record<string, unknown>;
  modulations?: ModulationRoute[];
  actions?: ActionInfo[];
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

  it("round-trips voiceMode + voiceCount and asserts their raw indices", async () => {
    await setConfig({ liveApiEnabled: true });
    await sleep(50);

    const id = await createInstrument("Drift");

    await updateDevice(id, {
      params: [
        { name: "voiceMode", value: "Stereo" },
        { name: "voiceCount", value: "16" },
      ],
    });

    const after = await readDevice(id, ["params"]);

    expect(paramValue(after, "voiceMode")).toBe("Stereo");
    expect(paramValue(after, "voiceCount")).toBe(16);

    // Drift has no queryable _list for these enums, so the raw indices guard the
    // property names + hardcoded catalog order (VOICE_MODES[2]="Stereo",
    // VOICE_COUNTS[2]=16; verified vs Live 12.4 2026-05-25). A round-trip alone
    // can't catch a symmetric mismatch (write X, read back X). See AJM-397.
    const raw = parseToolResult<{ results: Array<{ result: number }> }>(
      await ctx.client!.callTool({
        name: "ppal-live-api",
        arguments: {
          path: `id ${id}`,
          operations: [
            { type: "getProperty", property: "voice_mode_index" },
            { type: "getProperty", property: "voice_count_index" },
          ],
        },
      }),
    );

    expect(raw.results[0]!.result).toBe(2);
    expect(raw.results[1]!.result).toBe(2);
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

  it('lists mod-matrix actions via include: ["actions"]', async () => {
    const id = await createInstrument("Wavetable");
    const { actions } = await readDevice(id, ["actions"]);

    expect((actions ?? []).map((a) => a.name)).toStrictEqual(
      expect.arrayContaining([
        "setModulation",
        "clearModulation",
        "addModulationTarget",
      ]),
    );

    const setMod = actions?.find((a) => a.name === "setModulation");

    expect(setMod?.signature).toContain("setModulation(");
    expect(setMod?.description.length).toBeGreaterThan(0);
  });

  it("surfaces the degrees unit on a Phase Offset param (param-values)", async () => {
    const id = await createInstrument("Wavetable");
    const device = await readDevice(id, ["param-values"], "Phase Offset");
    const phaseParam = device.parameters?.find((p) =>
      p.name.includes("Phase Offset"),
    );

    expect(phaseParam).toBeDefined();
    expect(phaseParam?.unit).toBe("degrees");
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

  it('lists sample-editing actions via include: ["actions"]', async () => {
    const id = await createInstrument("Simpler");
    const { actions } = await readDevice(id, ["actions"]);

    expect((actions ?? []).map((a) => a.name)).toStrictEqual(
      expect.arrayContaining([
        "reverse",
        "crop",
        "warpDouble",
        "warpHalf",
        "warpAs",
      ]),
    );
    expect(actions?.find((a) => a.name === "warpAs")?.signature).toBe(
      "warpAs(beats)",
    );
  });

  it('include: ["sample"] returns the sample as a flat top-level field, not in params', async () => {
    const id = await createInstrument("Simpler");

    await updateDevice(id, {
      params: [{ name: "sample", value: SAMPLE_FILE }],
    });

    // Focused discovery view: just the sample file path as a top-level field
    // (ideal for scanning every pad's sample in a drum rack). No gainDb, and
    // no parameters[] at all.
    const sampleView = await readDevice(id, ["sample"]);

    expect(String(sampleView.sample)).toContain("sample.aiff");
    expect(sampleView).not.toHaveProperty("gainDb");
    expect(sampleView).not.toHaveProperty("parameters");
  });

  it('include: ["params"] returns sample (and gainDb) inside parameters[], not top-level', async () => {
    const id = await createInstrument("Simpler");

    // Two calls: the sample must be loaded before gain can be set on it.
    await updateDevice(id, {
      params: [{ name: "sample", value: SAMPLE_FILE }],
    });
    await updateDevice(id, { params: [{ name: "gainDb", value: "-6" }] });

    // Full params view: sample + gainDb appear as {name, value} entries, with
    // no flat top-level sample field.
    const paramsView = await readDevice(id, ["params"]);

    expect(String(paramValue(paramsView, "sample"))).toContain("sample.aiff");
    expect(paramValue(paramsView, "gainDb")).toBeCloseTo(-6, 0);
    expect(paramsView).not.toHaveProperty("sample");
  });

  it('include: ["*"] emits both the top-level sample field and the sample param entry', async () => {
    const id = await createInstrument("Simpler");

    await updateDevice(id, {
      params: [{ name: "sample", value: SAMPLE_FILE }],
    });

    // "*" requests both params and sample includes; they are independent, so
    // the flat top-level sample and the sample param entry both appear.
    const allView = await readDevice(id, ["*"]);

    expect(String(allView.sample)).toContain("sample.aiff");
    expect(String(paramValue(allView, "sample"))).toContain("sample.aiff");
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
  it("round-trips routingMode/envListen and guards the routing_mode catalog", async () => {
    await setConfig({ liveApiEnabled: true });
    await sleep(50);

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

    // Roar exposes a read-only routing_mode_list, so unlike Drift this guard is
    // non-circular: assert (a) the write landed at the expected raw index and
    // (b) our hardcoded ROUTING_MODES order matches Live's authoritative catalog
    // (lowercased/hyphenated), so a future Live reorder is caught. Read the list
    // with the raw `get` op — `getProperty` returns only its first element.
    // Verified vs Live 12.4 2026-05-25. See AJM-397.
    const raw = parseToolResult<{ results: Array<{ result: unknown }> }>(
      await ctx.client!.callTool({
        name: "ppal-live-api",
        arguments: {
          path: `id ${id}`,
          operations: [
            { type: "getProperty", property: "routing_mode_index" },
            { type: "get", property: "routing_mode_list" },
          ],
        },
      }),
    );

    expect(raw.results[0]!.result).toBe(2);

    const catalog = (raw.results[1]!.result as string[]).map((label) =>
      label.toLowerCase().replace(/ /g, "-"),
    );

    expect(catalog).toStrictEqual([
      "single",
      "serial",
      "parallel",
      "multi-band",
      "mid-side",
      "feedback",
      "delay",
    ]);
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

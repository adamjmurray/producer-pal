// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for params that have no effect in the device's current mode.
 *
 * Reads: Live leaves every rate param of a mode-switched LFO active, so our
 * `inactiveWhen` rules mark the ones the mode doesn't use. The rules match
 * Live's param names, which change between Live versions, so only a real Live
 * can tell whether they still fire.
 *
 * Writes: a write to an inactive param still goes in (setting it before
 * switching modes is valid), and its entry says it has no effect. EQ Eight's B
 * side in stereo mode and a Notch band's Gain are Live's own inactive params.
 * Uses: e2e-test-set
 *
 * Run with: npm run e2e:mcp -- device/params/ppal-inactive-params
 */
import { describe, expect, it } from "vitest";
import {
  callToolAndSettle,
  createMidiTrack,
  createTestDevice,
  parseToolResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

const INACTIVE =
  "inactive in the device's current mode, so it has no effect until that changes";

interface ParamEntry {
  id: string;
  name: string;
  value?: unknown;
  state?: string;
  detail?: string;
}

/**
 * Write params on a device and return the param entries.
 * @param id - The device
 * @param params - The params to write, name → value
 * @returns The entries, by param name
 */
async function write(
  id: string,
  params: Record<string, string>,
): Promise<Record<string, ParamEntry>> {
  const result = parseToolResult<{ params: ParamEntry[] }>(
    await callToolAndSettle(ctx.client!, "ppal-update-device", {
      id,
      params: Object.entries(params).map(([name, value]) => ({ name, value })),
    }),
  );

  return Object.fromEntries(result.params.map((entry) => [entry.name, entry]));
}

/**
 * Which of a device's params read as inactive.
 * @param id - The device
 * @param names - The params to check
 * @returns The inactive ones, in the order given
 */
async function inactiveOf(id: string, names: string[]): Promise<string[]> {
  const { parameters } = parseToolResult<{ parameters: ParamEntry[] }>(
    await callToolAndSettle(ctx.client!, "ppal-read-device", {
      id,
      include: ["param-values"],
    }),
  );
  const byName = new Map(parameters.map((param) => [param.name, param]));

  for (const name of names) {
    expect(byName.has(name), `${name} exists`).toBe(true);
  }

  return names.filter((name) => byName.get(name)?.state === "inactive");
}

/**
 * A device on a fresh MIDI track (audio effects work on one too).
 * @param name - The device to create
 * @returns Its id
 */
async function createOnNewTrack(name: string): Promise<string> {
  const track = await createMidiTrack(ctx.client!);

  return createTestDevice(ctx.client!, name, `t${track}`);
}

describe("read-device marks mode-gated rate params inactive", () => {
  it("Wavetable: the LFO rate its Sync mode doesn't use", async () => {
    const id = await createOnNewTrack("Wavetable");
    const rates = ["LFO 1 Freq", "LFO 1 Synced", "LFO 2 Freq", "LFO 2 Synced"];

    await write(id, { "LFO 1 Sync": "Tempo", "LFO 2 Sync": "Free" });

    expect(await inactiveOf(id, rates)).toStrictEqual([
      "LFO 1 Freq",
      "LFO 2 Synced",
    ]);
  });

  it("Drift: every LFO and cycling envelope rate but the mode's own", async () => {
    const id = await createOnNewTrack("Drift");
    const lfo = ["LFO Freq", "LFO Time", "LFO Ratio", "LFO Synced"];
    const cyc = ["Cyc Env Rate", "Cyc Env Time", "Cyc Env Ratio"];

    await write(id, { "LFO Mode": "Sync", "Cyc Env Mode": "Time" });

    expect(
      await inactiveOf(id, [...lfo, ...cyc, "Cyc Env Synced"]),
    ).toStrictEqual([
      "LFO Freq",
      "LFO Time",
      "LFO Ratio",
      "Cyc Env Rate",
      "Cyc Env Ratio",
      "Cyc Env Synced",
    ]);
  });

  it.each([
    ["Auto Filter", "Dotted"],
    ["Auto Pan-Tremolo", "Triplet"],
  ])("%s: every LFO rate but the synced one", async (device, mode) => {
    const id = await createOnNewTrack(device);
    const rates = ["LFO Freq", "LFO Time", "LFO Synced", "LFO 16th"];

    await write(id, { "LFO Mode": mode });

    expect(await inactiveOf(id, rates)).toStrictEqual([
      "LFO Freq",
      "LFO Time",
      "LFO 16th",
    ]);
  });

  it("Phaser-Flanger: each LFO's rate its Sync toggle doesn't use", async () => {
    const id = await createOnNewTrack("Phaser-Flanger");
    const rates = ["LFO 1 Freq", "LFO 1 Synced", "LFO 2 Freq", "LFO 2 Synced"];

    await write(id, { "LFO 1 Sync": "On", "LFO 2 Sync": "Off" });

    expect(await inactiveOf(id, rates)).toStrictEqual([
      "LFO 1 Freq",
      "LFO 2 Synced",
    ]);
  });
});

describe("ppal-update-device: writes to inactive params", () => {
  it("writes EQ Eight's B side in stereo mode and says it has no effect", async () => {
    const id = await createOnNewTrack("EQ Eight");
    // A band's default on/off and type come from the machine's default preset.
    const entries = await write(id, {
      "2 Filter On A": "On",
      "2 Filter Type A": "Bell",
      "2 Filter Type B": "High Shelf",
      "2 Gain A": "3",
    });

    expect(entries["2 Filter Type B"]).toStrictEqual({
      id: expect.any(String),
      name: "2 Filter Type B",
      value: "High Shelf",
      detail: INACTIVE,
    });
    expect(entries["2 Gain A"]?.detail).toBeUndefined();
  });

  it("judges the mode after the whole call: Gain on a band the call made a Notch", async () => {
    const id = await createOnNewTrack("EQ Eight");
    const entries = await write(id, {
      "3 Filter On A": "On",
      "3 Filter Type A": "Notch",
      "3 Gain A": "3",
    });

    expect(entries["3 Filter Type A"]?.detail).toBeUndefined();
    expect(entries["3 Gain A"]?.detail).toBe(INACTIVE);
  });

  it("marks a param our inactiveWhen rules make inactive", async () => {
    const id = await createOnNewTrack("Wavetable");
    const entries = await write(id, {
      "LFO 1 Sync": "Tempo",
      "LFO 1 Freq": "2",
      "LFO 1 Synced": "1/4",
    });

    expect(entries["LFO 1 Freq"]?.detail).toBe(INACTIVE);
    expect(entries["LFO 1 Synced"]?.detail).toBeUndefined();
  });
});

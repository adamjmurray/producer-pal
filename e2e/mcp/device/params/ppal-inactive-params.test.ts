// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for params that have no effect in the device's current mode.
 *
 * Live leaves every rate param of a mode-switched LFO active, so our
 * `inactiveWhen` rules mark the ones the mode doesn't use. The rules match
 * Live's param names, which change between Live versions, so only a real Live
 * can tell whether they still fire.
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

interface ParamEntry {
  id: string;
  name: string;
  value?: unknown;
  state?: string;
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

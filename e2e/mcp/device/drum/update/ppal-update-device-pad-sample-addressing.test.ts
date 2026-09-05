// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for how a pad `sample` write addresses its target.
 *
 * A sample belongs to one layer, so a stacked pad has to say which. Writing
 * "the pad" used to load the first layer silently, and under `force` that
 * replaces an instrument the caller never named. A `dN` is accepted but checked
 * against the instrument the search found, so an index written out of habit
 * can't look honored when it named something else.
 *
 * Run with: npm run e2e:mcp -- ppal-update-device-pad-sample-addressing
 */
import { describe, expect, it } from "vitest";
import {
  DRUM_LOOP_FILE,
  KICK_FILE,
  createTestDeviceAt,
  parseToolResult,
  setupMcpTestContext,
  sleep,
} from "../../../mcp-test-helpers.ts";
import { callWithWarnings } from "../../helpers/racks-test-helpers.ts";
import { createLayeredPad } from "../drum-pad-test-helpers.ts";

const ctx = setupMcpTestContext();

/**
 * Write a sample through the rack's path-prefixed param form.
 * @param rackPath - The Drum Rack's path
 * @param prefix - The pad prefix, as the caller spells it (e.g. "pD1/c1")
 * @param value - Absolute path of the sample to load
 * @returns The warnings the write produced
 */
async function writeSample(
  rackPath: string,
  prefix: string,
  value: string,
): Promise<string[]> {
  const { warnings } = await callWithWarnings(
    ctx.client!,
    "ppal-update-device",
    { path: rackPath, params: [{ name: `${prefix}/sample`, value }] },
  );

  await sleep(200);

  return warnings;
}

/**
 * Read the sample loaded on one layer's instrument.
 * @param path - Path to the instrument (e.g. "t3/d0/pD1/c1/d0")
 * @returns The sample's file path, or undefined when none is loaded
 */
async function sampleAt(path: string): Promise<string | undefined> {
  return parseToolResult<{ sample?: string }>(
    await ctx.client!.callTool({
      name: "ppal-read-device",
      arguments: { path, include: ["sample"] },
    }),
  ).sample;
}

describe("a pad holding several layers", () => {
  it("skips a write that names no layer, and lists the ones to name", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);
    const before = [
      await sampleAt(`${rackPath}/pD1/c0/d0`),
      await sampleAt(`${rackPath}/pD1/c1/d0`),
    ];

    const warnings = await writeSample(rackPath, "pD1", DRUM_LOOP_FILE);

    expect(
      warnings.some(
        (w) => w.includes("sample write SKIPPED") && w.includes("2 layers"),
      ),
    ).toBe(true);
    // The retries are param names relative to the rack — what the caller
    // re-sends — not the pad's full path.
    expect(
      warnings.some(
        (w) => w.includes('"pD1/c0/sample"') && w.includes('"pD1/c1/sample"'),
      ),
    ).toBe(true);

    expect([
      await sampleAt(`${rackPath}/pD1/c0/d0`),
      await sampleAt(`${rackPath}/pD1/c1/d0`),
    ]).toStrictEqual(before);
  });

  // A device index names no layer, so it settles nothing here.
  it("skips a write that names only a device index", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);

    const warnings = await writeSample(rackPath, "pD1/d0", DRUM_LOOP_FILE);

    expect(warnings.some((w) => w.includes("2 layers"))).toBe(true);
  });

  it("writes the named layer and leaves the other alone", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);
    const untouched = await sampleAt(`${rackPath}/pD1/c0/d0`);

    expect(await writeSample(rackPath, "pD1/c1", DRUM_LOOP_FILE)).toStrictEqual(
      [],
    );

    expect(await sampleAt(`${rackPath}/pD1/c1/d0`)).toBe(DRUM_LOOP_FILE);
    expect(await sampleAt(`${rackPath}/pD1/c0/d0`)).toBe(untouched);
  });
});

describe("a device index that is not the pad's instrument", () => {
  // Live sorts MIDI effects ahead of the instrument, so a `d0` written out of
  // habit names the effect on any pad holding one.
  it("skips the write and points at the form that finds the instrument", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);

    await createTestDeviceAt(ctx.client!, "Arpeggiator", `${rackPath}/pC1/c0`);

    const loaded = await sampleAt(`${rackPath}/pC1/c0/d1`);
    const warnings = await writeSample(rackPath, "pC1/d0", DRUM_LOOP_FILE);

    expect(
      warnings.some(
        (w) =>
          w.includes("d0 is not its instrument, which is at d1") &&
          w.includes('"pC1/sample"'),
      ),
    ).toBe(true);
    expect(await sampleAt(`${rackPath}/pC1/c0/d1`)).toBe(loaded);
  });

  it("writes when the index does name the instrument", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);

    await createTestDeviceAt(ctx.client!, "Arpeggiator", `${rackPath}/pC1/c0`);

    expect(await writeSample(rackPath, "pC1/d1", KICK_FILE)).toStrictEqual([]);
    expect(await sampleAt(`${rackPath}/pC1/c0/d1`)).toBe(KICK_FILE);
  });
});

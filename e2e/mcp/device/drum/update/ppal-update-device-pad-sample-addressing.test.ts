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
 * The pad is also addressable directly — by its own path, or by its
 * instrument's — and read-device prints both, so all three spellings have to
 * say the same thing about the same write.
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
import {
  callWithWarnings,
  type ParamEntryResult,
} from "../../helpers/racks-test-helpers.ts";
import { createLayeredPad, readDrumPad } from "../drum-pad-test-helpers.ts";

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

/**
 * Write a sample by addressing the pad, one of its layers, or a device on it —
 * the spellings read-device hands back, rather than the rack's param-name
 * shortcut.
 * @param path - What the call addresses
 * @param value - Absolute path of the sample to load
 * @param force - Whether to pass force:true
 * @returns The `params` the result reports, and the warnings the write produced
 */
async function writeSampleByPath(
  path: string,
  value: string,
  force = false,
): Promise<{ params: ParamEntryResult[]; warnings: string[] }> {
  const { data, warnings } = await callWithWarnings(
    ctx.client!,
    "ppal-update-device",
    {
      path,
      params: [{ name: "sample", value }],
      ...(force && { force: true }),
    },
  );

  await sleep(200);

  return { params: (data.params as ParamEntryResult[]) ?? [], warnings };
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

describe("a sample addressed by the pad's own path", () => {
  it("loads it onto the pad the path names, and reports what landed", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);

    const { params, warnings } = await writeSampleByPath(
      `${rackPath}/pC1`,
      DRUM_LOOP_FILE,
    );

    expect(warnings).toStrictEqual([]);
    expect(params).toStrictEqual([{ name: "sample", value: DRUM_LOOP_FILE }]);
    expect(await sampleAt(`${rackPath}/pC1/c0/d0`)).toBe(DRUM_LOOP_FILE);
  });

  it("writes the layer a chain path names and leaves the other alone", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);
    const untouched = await sampleAt(`${rackPath}/pD1/c0/d0`);

    const { warnings } = await writeSampleByPath(
      `${rackPath}/pD1/c1`,
      DRUM_LOOP_FILE,
    );

    expect(warnings).toStrictEqual([]);
    expect(await sampleAt(`${rackPath}/pD1/c1/d0`)).toBe(DRUM_LOOP_FILE);
    expect(await sampleAt(`${rackPath}/pD1/c0/d0`)).toBe(untouched);
  });

  // Same ambiguity the rack's "pD1/sample" shortcut refuses, and force must not
  // get past it: which layer to replace is exactly what nobody has said.
  it("skips a stacked pad, naming the layer paths in the entry", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);
    const before = [
      await sampleAt(`${rackPath}/pD1/c0/d0`),
      await sampleAt(`${rackPath}/pD1/c1/d0`),
    ];

    const { params, warnings } = await writeSampleByPath(
      `${rackPath}/pD1`,
      DRUM_LOOP_FILE,
      true,
    );

    expect(params[0]?.name).toBe("sample");
    expect(params[0]?.reason).toContain(`"${rackPath}/pD1/c0"`);
    expect(params[0]?.reason).toContain(`"${rackPath}/pD1/c1"`);
    expect(warnings.some((w) => w.includes("2 layers"))).toBe(true);

    expect([
      await sampleAt(`${rackPath}/pD1/c0/d0`),
      await sampleAt(`${rackPath}/pD1/c1/d0`),
    ]).toStrictEqual(before);
  });

  it("creates the Simpler on a pad that holds only a MIDI effect", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);

    await createTestDeviceAt(ctx.client!, "Arpeggiator", `${rackPath}/pE1/c0`);

    const { params, warnings } = await writeSampleByPath(
      `${rackPath}/pE1`,
      KICK_FILE,
    );

    expect(warnings).toStrictEqual([]);
    expect(params).toStrictEqual([{ name: "sample", value: KICK_FILE }]);
  });
});

describe("a sample addressed by the device's own path", () => {
  // The path read-device prints for a pad's instrument. It used to answer
  // "param not found", which reads as a misspelling.
  it("says the instrument's sample can't be set, and names the pad call that can", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);
    const operator = await createTestDeviceAt(
      ctx.client!,
      "Operator",
      `${rackPath}/pE1/c0`,
    );

    const { params, warnings } = await writeSampleByPath(
      operator,
      KICK_FILE,
      true,
    );
    const reason = params[0]?.reason ?? "";

    expect(params[0]?.name).toBe("sample");
    expect(reason).toContain("whose sample the Live API can't set");
    expect(reason).toContain(`path:"${rackPath}"`);
    expect(reason).toContain('params:[{name:"pE1/c0/sample"');
    expect(reason).toContain("ask the user first");
    // The redirect must not hand back a ready-to-run destructive call: the pad
    // call it names hits the swap guard, which is where force is offered.
    expect(reason).not.toContain("force:true");
    expect(warnings.some((w) => w.includes("sample write SKIPPED"))).toBe(true);

    // A device path never creates or replaces a device — not even under force.
    const devices = (await readDrumPad(ctx.client!, `${rackPath}/pE1`))
      .chains?.[0]?.devices;

    expect(devices).toHaveLength(1);
    expect(devices?.[0]?.type).toContain("Operator");
  });

  it("does not promise to replace a device that is not the pad's instrument", async () => {
    const { rackPath } = await createLayeredPad(ctx.client!);
    const arp = await createTestDeviceAt(
      ctx.client!,
      "Arpeggiator",
      `${rackPath}/pC1/c0`,
    );

    const reason =
      (await writeSampleByPath(arp, KICK_FILE)).params[0]?.reason ?? "";

    expect(reason).toContain("belongs to its instrument");
    expect(reason).toContain(`path:"${rackPath}"`);
    expect(reason).not.toContain("force:true");
  });
});

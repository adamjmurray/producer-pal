// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the drum pad sample-write policy. Uses: racks-test, whose Kit
 * has a Drum Sampler on pAb1, a Sampler on pA1, and a multi-sample Simpler on
 * pBb1. See e2e/live-sets/racks-test-spec.md.
 *
 * The policy is uniform: the write targets the pad's *instrument*, wherever it
 * sits in the chain, and `force` replaces it whenever the Live API can't set its
 * sample. Only a single-sample Simpler is written in place.
 *
 * Run with: npm run e2e:mcp -- ppal-update-device-pad-sample-policy
 */
import { describe, expect, it } from "vitest";
import {
  createTestDeviceAt,
  KICK_FILE,
  setupMcpTestContext,
} from "../../mcp-test-helpers.ts";
import {
  callWithWarnings,
  type DeviceInfo,
  KIT,
  RACKS_TEST_PATH,
  readKitPads,
} from "../helpers/racks-test-helpers.ts";

// Not `once: true`: the force cases destroy the pad's instrument, so each test
// needs the Set reloaded from disk.
const ctx = setupMcpTestContext({ liveSetPath: RACKS_TEST_PATH });

/**
 * Write a sample onto a pad through the rack's path-prefixed param form.
 * @param padNote - Pad note segment (e.g. "pAb1")
 * @param force - Whether to pass force:true
 * @returns The warnings the write produced
 */
async function writeSample(padNote: string, force = false): Promise<string[]> {
  const { warnings } = await callWithWarnings(
    ctx.client!,
    "ppal-update-device",
    {
      path: KIT,
      params: [{ name: `${padNote}/sample`, value: KICK_FILE }],
      ...(force && { force: true }),
    },
  );

  return warnings;
}

/**
 * Read the devices sitting on a pad.
 * @param padName - The pad's name
 * @returns The pad's devices, in chain order
 */
async function padDevices(padName: string): Promise<DeviceInfo[]> {
  const kit = await readKitPads(ctx.client!);

  return (
    kit.drumPads?.find((p) => p.name === padName)?.chains?.[0]?.devices ?? []
  );
}

/**
 * The two halves of the policy for a pad whose instrument can't take a sample:
 * skipped with a warning by default, replaced with a Simpler under force.
 * @param pad - Pad note segment (e.g. "pAb1")
 * @param padName - The pad's name, for reading it back
 * @param held - How the warning names the instrument
 * @param instrumentType - Substring the untouched instrument's type contains
 */
function padSwapTests(
  pad: string,
  padName: string,
  held: string,
  instrumentType: string,
): void {
  it("skips the write and warns, leaving the instrument alone", async () => {
    const warnings = await writeSample(pad);

    expect(
      warnings.some(
        (w) => w.includes("sample write SKIPPED") && w.includes(held),
      ),
    ).toBe(true);
    // The warning is where the model learns force:true exists.
    expect(warnings.some((w) => w.includes("force:true"))).toBe(true);

    expect((await padDevices(padName))[0]?.type).toContain(instrumentType);
  });

  it("replaces it with a Simpler under force, and says what was lost", async () => {
    const warnings = await writeSample(pad, true);

    expect(
      warnings.some(
        (w) => w.includes("force:true") && w.includes("settings are gone"),
      ),
    ).toBe(true);

    const devices = await padDevices(padName);

    expect(devices).toHaveLength(1);
    expect(devices[0]?.type).toContain("Simpler");
  });
}

// Each pad is a different reason the Live API can't set the sample, and all
// three resolve the same way. Baked into the Set because none of them — least of
// all multi-sample mode — can be built through the Live API.
describe("sample writes onto a pad whose instrument can't take one", () => {
  describe("Drum Sampler", () => {
    padSwapTests("pAb1", "Drum Sampler", "a Drum Sampler", "Drum Sampler");
  });

  describe("Sampler", () => {
    padSwapTests("pA1", "Sampler", "a Sampler", "Sampler");
  });

  describe("Simpler in multi-sample mode", () => {
    padSwapTests(
      "pBb1",
      "Multi-Simpler",
      "a Simpler in multi-sample mode",
      "Simpler",
    );
  });
});

describe("a MIDI effect in front of the pad's instrument", () => {
  // Live keeps a chain sorted by device type, so a pad with any MIDI effect on
  // it has its instrument at d1, not d0. Resolving by index instead of by type
  // made every such pad unwritable — and under force would have deleted the
  // MIDI effect while leaving the instrument untouched.
  it("writes the sample to the instrument and leaves the MIDI effect in place", async () => {
    const arp = await createTestDeviceAt(
      ctx.client!,
      "Arpeggiator",
      `${KIT}/pC1/c0`,
    );

    // Live spells a pad's chain rack-relatively, so the same device is
    // `<kit>/c0/d0` and `<kit>/pC1/c0/d0`. What matters is the d0: the
    // Arpeggiator went in ahead of the instrument.
    expect(arp).toBe(`${KIT}/c0/d0`);

    const warnings = await writeSample("pC1");

    expect(warnings).toStrictEqual([]);

    const devices = await padDevices("Kick");

    expect(devices).toHaveLength(2);
    expect(devices[0]?.type).toContain("Arpeggiator");
    expect(devices[1]?.type).toContain("Simpler");
  });

  it("replaces the instrument under force, not the MIDI effect", async () => {
    await createTestDeviceAt(ctx.client!, "Arpeggiator", `${KIT}/pAb1/c0`);

    await writeSample("pAb1", true);

    const devices = await padDevices("Drum Sampler");

    expect(devices).toHaveLength(2);
    expect(devices[0]?.type).toContain("Arpeggiator");
    expect(devices[1]?.type).toContain("Simpler");
  });
});

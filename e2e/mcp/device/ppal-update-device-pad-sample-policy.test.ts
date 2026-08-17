// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the drum pad sample-write policy on non-Simpler instruments.
 * Uses: racks-test, whose Kit has a Drum Sampler on pAb1 and a Sampler on pA1.
 * See e2e/live-sets/racks-test-spec.md.
 *
 * The asymmetry is the point: `force` only unlocks the Drum Sampler swap (the
 * Live API can't set its sample, so replacing it is the only way to honor the
 * write), never the generic "pad already has a device" refusal.
 *
 * Run with: npm run e2e:mcp -- ppal-update-device-pad-sample-policy
 */
import { describe, expect, it } from "vitest";
import { KICK_FILE, setupMcpTestContext } from "../mcp-test-helpers.ts";
import {
  callWithWarnings,
  type DeviceInfo,
  KIT,
  RACKS_TEST_PATH,
  readKitPads,
} from "./helpers/racks-test-helpers.ts";

// Not `once: true`: the force case destroys the Drum Sampler, so each test
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
      params: [{ name: `${padNote}/d0/sample`, value: KICK_FILE }],
      ...(force && { force: true }),
    },
  );

  return warnings;
}

/**
 * Read the instrument sitting on a pad.
 * @param padName - The pad's name
 * @returns The pad's first device
 */
async function padDevice(padName: string): Promise<DeviceInfo | undefined> {
  const kit = await readKitPads(ctx.client!);

  return kit.drumPads?.find((p) => p.name === padName)?.chains?.[0]
    ?.devices?.[0];
}

describe("drum pad sample writes onto a non-Simpler instrument", () => {
  describe("Drum Sampler", () => {
    it("skips the write and warns, keeping the Drum Sampler", async () => {
      const warnings = await writeSample("pAb1");

      expect(
        warnings.some(
          (w) =>
            w.includes("sample write SKIPPED") && w.includes("Drum Sampler"),
        ),
      ).toBe(true);
      // The warning is where the model learns force:true exists.
      expect(warnings.some((w) => w.includes("force:true"))).toBe(true);

      expect((await padDevice("Drum Sampler"))?.type).toContain("Drum Sampler");
    });

    it("replaces it with a Simpler under force, and says what was lost", async () => {
      const warnings = await writeSample("pAb1", true);

      expect(
        warnings.some(
          (w) => w.includes("force:true") && w.includes("settings are gone"),
        ),
      ).toBe(true);

      expect((await padDevice("Drum Sampler"))?.type).toContain("Simpler");
    });
  });

  describe("Sampler", () => {
    it("skips the write and warns, pointing at delete rather than force", async () => {
      const warnings = await writeSample("pA1");

      expect(
        warnings.some(
          (w) =>
            w.includes("already has a Sampler") && w.includes("ppal-delete"),
        ),
      ).toBe(true);

      expect((await padDevice("Sampler"))?.type).toContain("Sampler");
    });

    // force is scoped to the Drum Sampler swap: it must not become a general
    // "overwrite whatever is on the pad" escape.
    it("still refuses under force", async () => {
      const warnings = await writeSample("pA1", true);

      expect(warnings.some((w) => w.includes("already has a Sampler"))).toBe(
        true,
      );

      expect((await padDevice("Sampler"))?.type).toContain("Sampler");
    });
  });
});

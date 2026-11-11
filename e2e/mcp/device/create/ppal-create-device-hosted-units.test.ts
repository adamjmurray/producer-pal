// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the unit a number is read in when it sets a hosted plug-in's
 * param. Uses Serum 2, whose envelope times show ms below a second and s above
 * ("Env 1 Decay" starts at "1.00 s", "Env 1 Release" at "15 ms"), so it skips
 * on a machine without it.
 *
 * Needs the wrappers installed (`npm run install:plugin-host`) and the remote
 * script.
 *
 * Uses: e2e-test-set (adds its own MIDI track)
 *
 * Run with: npm run e2e:mcp -- e2e/mcp/device/create/ppal-create-device-hosted-units.test.ts
 */
import { describe, expect, it } from "vitest";
import { setupMcpTestContext } from "../../mcp-test-helpers";
import {
  hasVst3,
  hostedPluginHelpers,
} from "../helpers/hosted-plugin-test-helpers";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers";

// The search lands on the closest value the param shows, not the exact one.
const TOLERANCE = 0.05;

describe.skipIf(!REMOTE_SCRIPT_E2E || !hasVst3("Serum2.vst3"))(
  "hosted plug-in param units",
  () => {
    requireRemoteScript();

    const ctx = setupMcpTestContext();
    const { call, hostOnNewTrack, readDevice } = hostedPluginHelpers(ctx);

    /**
     * Set one param, then read what the plug-in shows for it.
     * @param path - The hosted device
     * @param name - The param's name
     * @param value - The value to send
     * @returns The display's number and unit
     */
    async function setAndRead(
      path: string,
      name: string,
      value: string,
    ): Promise<{ number: number; unit: string }> {
      await call("ppal-update-device", { path, params: [{ name, value }] });

      const [param] = (await readDevice(path, name)).parameters ?? [];
      const match = /^([\d.]+)\s*(\S+)$/.exec(String(param?.value));

      expect(
        match,
        `"${String(param?.value)}" is a number and a unit`,
      ).not.toBe(null);

      return { number: Number(match?.[1]), unit: String(match?.[2]) };
    }

    /**
     * @param actual - The number shown
     * @param wanted - The number asked for
     */
    function expectNear(actual: number, wanted: number): void {
      expect(Math.abs(actual - wanted)).toBeLessThanOrEqual(wanted * TOLERANCE);
    }

    it("reads a bare number in seconds on a param showing seconds", async () => {
      const { path } = await hostOnNewTrack("Serum 2");
      const [before] = (await readDevice(path, "Env 1 Decay")).parameters ?? [];

      expect(before?.value).toMatch(/ s$/);

      const shown = await setAndRead(path, "Env 1 Decay", "2");

      expect(shown.unit).toBe("s");
      expectNear(shown.number, 2);
    });

    it("reads a bare number in ms on a param showing ms", async () => {
      const { path } = await hostOnNewTrack("Serum 2");
      const [before] =
        (await readDevice(path, "Env 1 Release")).parameters ?? [];

      expect(before?.value).toMatch(/ ms$/);

      const shown = await setAndRead(path, "Env 1 Release", "40");

      expect(shown.unit).toBe("ms");
      expectNear(shown.number, 40);
    });

    it("reads a number with a unit as written, whatever the param shows", async () => {
      const { path } = await hostOnNewTrack("Serum 2");
      // Shows seconds, asked in ms.
      const decay = await setAndRead(path, "Env 1 Decay", "500 ms");

      expect(decay.unit).toBe("ms");
      expectNear(decay.number, 500);

      // Shows ms, asked in seconds.
      const release = await setAndRead(path, "Env 1 Release", "2 s");

      expect(release.unit).toBe("s");
      expectNear(release.number, 2);
    });
  },
);

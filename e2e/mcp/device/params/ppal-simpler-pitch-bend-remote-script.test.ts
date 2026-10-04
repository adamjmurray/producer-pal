// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for a Simpler's pitch bend ranges, which only the Producer Pal
 * remote script can reach: ppal-read-device lists them and ppal-update-device
 * writes them. Opt-in like the other remote script suites.
 *
 * Uses: racks-test — t0/d0/c0/d0/pC1/c0/d0 is the Simpler "synth-kick" on the
 * Kit's C1 pad. Its ranges are read at run time and put back after each test.
 * See: e2e/live-sets/racks-test-spec.md
 *
 * Run with: npm run e2e:mcp:remote-script -- device/params/ppal-simpler-pitch-bend-remote-script
 */
import { afterEach, describe, expect, it } from "vitest";
import { RACKS_TEST_PATH } from "../../e2e-test-set.ts";
import {
  getToolErrorMessage,
  parseToolResult,
  resetConfig,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers.ts";
import {
  REMOTE_SCRIPT_E2E,
  requireRemoteScript,
} from "../helpers/remote-script-test-helpers.ts";

/** The Kit's C1 pad Simpler. */
const SIMPLER = "t0/d0/c0/d0/pC1/c0/d0";

interface Ranges {
  pitchBendRange?: number;
  notePitchBendRange?: number;
}

describe.skipIf(!REMOTE_SCRIPT_E2E)("Simpler pitch bend ranges", () => {
  requireRemoteScript();

  const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

  afterEach(async () => {
    await resetConfig();
  });

  /**
   * Read the Simpler's ranges from its params.
   * @returns Each range the read listed
   */
  async function readRanges(): Promise<Ranges> {
    await sleep(150);

    const { parameters } = parseToolResult<{
      parameters: Array<{ name: string; value: number }>;
    }>(
      await ctx.client!.callTool({
        name: "ppal-read-device",
        arguments: { path: SIMPLER, include: ["params"] },
      }),
    );

    return Object.fromEntries(
      parameters
        .filter((param) => /pitchbendrange$/i.test(param.name))
        .map((param) => [param.name, param.value]),
    ) as Ranges;
  }

  /**
   * Update the Simpler's ranges.
   * @param args - The ranges to set
   * @returns The raw tool result
   */
  async function update(args: Ranges): Promise<unknown> {
    return await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: {
        path: SIMPLER,
        params: Object.entries(args).map(([name, value]) => ({
          name,
          value: String(value),
        })),
      },
    });
  }

  /**
   * Run a test body and put the ranges back whatever happens.
   * @param body - The test, given the ranges before it began
   */
  async function restoring(
    body: (before: Required<Ranges>) => Promise<void>,
  ): Promise<void> {
    const before = (await readRanges()) as Required<Ranges>;

    try {
      await body(before);
    } finally {
      await update(before);
      expect(await readRanges()).toStrictEqual(expect.objectContaining(before));
    }
  }

  it("reads both ranges, in range", async () => {
    const ranges = await readRanges();

    expect(ranges.pitchBendRange).toBeGreaterThanOrEqual(0);
    expect(ranges.pitchBendRange).toBeLessThanOrEqual(24);
    expect(ranges.notePitchBendRange).toBeGreaterThanOrEqual(0);
    expect(ranges.notePitchBendRange).toBeLessThanOrEqual(48);
  });

  it("sets both and reads them back", async () => {
    await restoring(async () => {
      const entry = parseToolResult<{ params: unknown[] }>(
        await update({ pitchBendRange: 7, notePitchBendRange: 13 }),
      );

      expect(entry.params).toStrictEqual([
        { name: "pitchBendRange", value: 7 },
        { name: "notePitchBendRange", value: 13 },
      ]);
      expect(await readRanges()).toStrictEqual(
        expect.objectContaining({
          pitchBendRange: 7,
          notePitchBendRange: 13,
        }),
      );
    });
  });

  it("takes the ends of each range", async () => {
    await restoring(async () => {
      await update({ pitchBendRange: 24, notePitchBendRange: 48 });
      expect(await readRanges()).toStrictEqual(
        expect.objectContaining({
          pitchBendRange: 24,
          notePitchBendRange: 48,
        }),
      );

      await update({ pitchBendRange: 0, notePitchBendRange: 0 });
      expect(await readRanges()).toStrictEqual(
        expect.objectContaining({
          pitchBendRange: 0,
          notePitchBendRange: 0,
        }),
      );
    });
  });

  it("sets one and leaves the other", async () => {
    await restoring(async (before) => {
      await update({ pitchBendRange: before.pitchBendRange === 3 ? 4 : 3 });

      expect((await readRanges()).notePitchBendRange).toBe(
        before.notePitchBendRange,
      );
    });
  });

  it("refuses a value out of range, and writes nothing", async () => {
    await restoring(async (before) => {
      const result = await update({ pitchBendRange: 25 });

      expect(getToolErrorMessage(result)).toContain(
        'pitchBendRange must be an integer 0-24 (got "25")',
      );
      expect(await readRanges()).toStrictEqual(expect.objectContaining(before));
    });
  });

  it("leaves the ranges out of the read while the remote script is off", async () => {
    await setConfig({ remoteScriptEnabled: false });

    const read = await readRanges();

    expect(read.pitchBendRange).toBeUndefined();
    expect(read.notePitchBendRange).toBeUndefined();
  });

  it("says the write needs the remote script while it is off", async () => {
    await setConfig({ remoteScriptEnabled: false });

    const result = await update({ pitchBendRange: 5 });

    expect(getToolErrorMessage(result)).toContain(
      "needs the Producer Pal remote script",
    );
  });
});

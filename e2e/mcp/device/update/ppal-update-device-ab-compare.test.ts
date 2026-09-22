// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-update-device abCompare.
 * Nothing the read tools return exposes the A/B slot, so the switch is checked
 * through the Direct Live API tool. Which devices offer A/B at all is Live's
 * call: t3/d0 (Drift) does, t0/d0 (a Drum Rack) does not.
 * Uses: e2e-test-set
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-update-device-ab-compare
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  parseToolResultWithWarnings,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

const DRIFT_PATH = "live_set tracks 3 devices 0";
const COMPRESSOR_PATH = "live_set tracks 3 devices 1";

interface LiveApiResult {
  results: Array<{ result?: unknown }>;
}

async function usingPresetB(path = DRIFT_PATH): Promise<number> {
  const result = parseToolResult<LiveApiResult>(
    await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path,
        operations: [
          { type: "getProperty", property: "is_using_compare_preset_b" },
        ],
      },
    }),
  );

  return result.results[0]!.result as number;
}

async function abCompare(path: string, action: string): Promise<string[]> {
  const { warnings } = parseToolResultWithWarnings<unknown>(
    await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path, abCompare: action },
    }),
  );

  await sleep(100);

  return warnings;
}

describe("ppal-update-device abCompare", () => {
  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
  });

  it("switches a device between its A and B presets", async () => {
    expect(await usingPresetB()).toBe(0);

    expect(await abCompare("t3/d0", "b")).toStrictEqual([]);
    expect(await usingPresetB()).toBe(1);

    expect(await abCompare("t3/d0", "a")).toStrictEqual([]);
    expect(await usingPresetB()).toBe(0);
  });

  it("saves the current settings into the other slot", async () => {
    expect(await abCompare("t3/d0", "save")).toStrictEqual([]);
    // Saving copies A into B; it does not switch, so A stays selected.
    expect(await usingPresetB()).toBe(0);
  });

  // Each device takes the entry at its own position: one paired call leaves
  // the first on A and the second on B.
  it("gives each device the slot at its own position", async () => {
    expect(await abCompare("t3/d0,t3/d1", "b")).toStrictEqual([]);
    expect(await usingPresetB()).toBe(1);
    expect(await usingPresetB(COMPRESSOR_PATH)).toBe(1);

    const result = parseToolResult<Array<{ id: string; path?: string }>>(
      await ctx.client!.callTool({
        name: "ppal-update-device",
        arguments: { path: "t3/d0,t3/d1", abCompare: "a,b" },
      }),
    );

    await sleep(100);

    expect(result.map((entry) => entry.path)).toStrictEqual(["t3/d0", "t3/d1"]);
    expect(await usingPresetB()).toBe(0);
    expect(await usingPresetB(COMPRESSOR_PATH)).toBe(1);

    // Put the Compressor back on A, the way the set has it.
    expect(await abCompare("t3/d1", "a")).toStrictEqual([]);
  });

  it("refuses a device with no A/B", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-update-device",
      arguments: { path: "t0/d0", abCompare: "b" },
    });

    // abCompare was the whole call, so the lone device throws its reason.
    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      "A/B Compare is not available",
    );
  });
});

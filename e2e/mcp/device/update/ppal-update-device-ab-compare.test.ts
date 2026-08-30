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
  parseToolResult,
  parseToolResultWithWarnings,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext();

const DRIFT_PATH = "live_set tracks 3 devices 0";

interface LiveApiResult {
  results: Array<{ result?: unknown }>;
}

async function usingPresetB(): Promise<number> {
  const result = parseToolResult<LiveApiResult>(
    await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: {
        path: DRIFT_PATH,
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

  it("warns instead of failing on a device with no A/B", async () => {
    const warnings = await abCompare("t0/d0", "b");

    expect(warnings.join("\n")).toContain("A/B Compare not available");
  });
});

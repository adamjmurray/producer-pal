// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Pins what Live keeps when you write a raw value to a DeviceParameter.
 * setParamValueAndVerify decides "did this write land?" by comparing the label
 * Live renders for the value we asked for against the label for the value it
 * stored, so those two have to agree even on a display boundary.
 * Uses: e2e-test-set
 * See: e2e/live-sets/e2e-test-set-spec.md
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-update-device-param-storage
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  parseToolResult,
  setConfig,
  setupMcpTestContext,
} from "../../mcp-test-helpers";

interface LiveApiResult {
  results: Array<{ result?: unknown }>;
}

const VOLUME = "live_set tracks 0 mixer_device volume";

const ctx = setupMcpTestContext({ once: true });

/**
 * Run raw Live API operations against the volume parameter.
 * @param operations - Operations to run
 * @returns One result per operation
 */
async function volume(operations: unknown[]): Promise<unknown[]> {
  const result = parseToolResult<LiveApiResult>(
    await ctx.client!.callTool({
      name: "ppal-live-api",
      arguments: { path: VOLUME, operations },
    }),
  );

  return result.results.map((entry) => entry.result);
}

/**
 * The labels Live renders for a batch of raw values.
 * @param raws - Raw values
 * @returns Their display labels
 */
async function labels(raws: number[]): Promise<string[]> {
  const results = await volume(
    raws.map((raw) => ({
      type: "call",
      method: "str_for_value",
      args: [raw],
    })),
  );

  return results.map(String);
}

/**
 * Evenly spaced raw values across a window, both ends included.
 * @param lo - Window start
 * @param hi - Window end
 * @param count - How many values
 * @returns The values, in order
 */
function spread(lo: number, hi: number, count: number): number[] {
  const step = (hi - lo) / (count - 1);

  return Array.from({ length: count }, (_, i) => lo + i * step);
}

/**
 * The first index whose label differs from the one before it.
 * @param rendered - Labels in raw-value order
 * @returns The index, or -1 if they are all the same
 */
function firstChange(rendered: string[]): number {
  return rendered.findIndex((label, i) => i > 0 && label !== rendered[i - 1]);
}

/**
 * Narrow onto two adjacent raw values whose labels differ.
 * @returns The last raw below the boundary and the first at or above it
 */
async function findDisplayBoundary(): Promise<[number, number]> {
  let lo = 0.7;
  let hi = 0.9;

  // Each round is one tool call, and each divides the window by 40.
  for (let round = 0; round < 6; round++) {
    const raws = spread(lo, hi, 41);
    const rendered = await labels(raws);
    const at = firstChange(rendered);

    if (at < 0) break;

    lo = raws[at - 1] as number;
    hi = raws[at] as number;
  }

  return [lo, hi];
}

describe("device parameter storage", () => {
  beforeEach(async () => {
    await setConfig({ liveApiEnabled: true });
  });

  it("renders a written value and the value it stored the same way", async () => {
    const [original] = (await volume([
      { type: "getProperty", property: "value" },
    ])) as [number];
    const [below, above] = await findDisplayBoundary();

    // The search has to have found a real boundary, or nothing below is a test.
    const [labelBelow, labelAbove] = await labels([below, above]);

    expect(labelBelow).not.toBe(labelAbove);

    try {
      for (const raw of [below, above, (below + above) / 2]) {
        const [wanted] = await labels([raw]);
        const stored = (
          await volume([
            { type: "set", property: "value", value: raw },
            { type: "getProperty", property: "value" },
          ])
        )[1] as number;
        const [storedLabel] = await labels([stored]);

        // What setParamValueAndVerify compares. Live rounds the value it is
        // given to six significant digits before storing it as a 32-bit float,
        // so `stored` is never `raw` — but both render the same.
        expect(storedLabel).toBe(wanted);
        expect(stored).not.toBe(raw);
      }
    } finally {
      await volume([{ type: "set", property: "value", value: original }]);
    }
  });

  // Why setParamValueAndVerify asks Live to render the requested value rather
  // than predicting what Live will store. Math.fround is the obvious guess and
  // it lands on the far side of the boundary, which would warn "was not
  // changed" about a write that went in exactly as asked.
  it("is not predicted by rounding the request to a 32-bit float", async () => {
    const [original] = (await volume([
      { type: "getProperty", property: "value" },
    ])) as [number];
    const [below] = await findDisplayBoundary();

    try {
      const [wanted, guessed] = await labels([below, Math.fround(below)]);

      expect(guessed).not.toBe(wanted);
    } finally {
      await volume([{ type: "set", property: "value", value: original }]);
    }
  });
});

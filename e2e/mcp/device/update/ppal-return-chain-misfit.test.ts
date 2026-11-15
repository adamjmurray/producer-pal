// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for a device a rack's return chain can't take (create-device).
 *
 * Live takes only audio effects there and turns anything else down with no
 * reason, so the call refuses an instrument or MIDI effect first, naming the
 * return chain, and leaves it as it was.
 *
 * Uses: racks-test — the "Kit" Drum Rack has return chains. See
 * e2e/live-sets/specs/racks-test-spec.md.
 *
 * Run with: npm run e2e:mcp -- device/update/ppal-return-chain-misfit
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  setupMcpTestContext,
} from "../../mcp-test-helpers";
import { RACKS_TEST_PATH } from "../../e2e-test-set.ts";
import { KIT, readReturnChains } from "../helpers/racks-test-helpers.ts";

const ctx = setupMcpTestContext({ once: true, liveSetPath: RACKS_TEST_PATH });

const RETURN_CHAIN = `${KIT}/rc0`;

describe("ppal-create-device into a rack's return chain", () => {
  it.each([
    ["Operator", "an instrument"],
    ["Arpeggiator", "a MIDI effect"],
  ])("refuses %s, saying what the chain takes", async (deviceName, what) => {
    const before = (await readReturnChains(ctx.client!))[0]?.deviceCount ?? 0;

    const result = await ctx.client!.callTool({
      name: "ppal-create-device",
      arguments: { deviceName, path: `${RETURN_CHAIN}/d+` },
    });

    expect(isToolError(result)).toBe(true);
    expect(getToolErrorMessage(result)).toContain(
      `return chain ${RETURN_CHAIN}`,
    );
    expect(getToolErrorMessage(result)).toContain(
      `takes only audio effects; "${deviceName}" is ${what}`,
    );
    expect((await readReturnChains(ctx.client!))[0]?.deviceCount ?? 0).toBe(
      before,
    );
  });
});

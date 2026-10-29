// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E test for locator writes repeated many times in a row.
 * Automatically opens the e2e-test-set Live Set before each test.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-update-live-set repeated locator writes", () => {
  it("answers every create and delete, with and without playback", async () => {
    // Each locator write polls the playhead with scheduled Tasks. One the
    // garbage collector dropped never fired, and the call hung until the
    // 30s timeout — about one call in 25 — so only a long run catches it.
    const call = async (
      name: string,
      args: Record<string, unknown>,
    ): Promise<void> => {
      const result = await ctx.client!.callTool({ name, arguments: args });

      expect(
        isToolError(result) ? getToolErrorMessage(result) : "ok",
        `${name} ${JSON.stringify(args)}`,
      ).toBe("ok");
    };

    for (let cycle = 0; cycle < 40; cycle++) {
      await call("ppal-playback", { action: "play-arrangement" });
      await call("ppal-update-live-set", {
        locatorOperation: "create",
        locatorName: "E2E A,E2E B,E2E C",
        locatorTime: "41|1,49|1,57|1",
      });

      for (const name of ["E2E B", "E2E A", "E2E C"]) {
        await call("ppal-update-live-set", {
          locatorOperation: "delete",
          locatorName: name,
        });
      }
    }
  }, 300_000);
});

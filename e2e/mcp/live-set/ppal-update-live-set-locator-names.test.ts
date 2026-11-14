// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E test for finding a locator by a name Live holds with spaces around it.
 * Automatically opens the e2e-test-set Live Set before each test. Uses
 * ppal-live-api (a debug build only: `npm run build:debug`).
 *
 * Run with: npm run e2e:mcp -- ppal-update-live-set-locator-names
 */
import { describe, expect, it } from "vitest";
import {
  parseToolResult,
  setConfig,
  setupMcpTestContext,
  sleep,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext();

interface LocatorInfo {
  id: string;
  name: string;
}

/**
 * Call a tool and parse its result.
 * @param name - Tool name
 * @param args - Tool args
 * @returns The parsed result
 */
async function call<T>(name: string, args: Record<string, unknown>) {
  return parseToolResult<T>(
    await ctx.client!.callTool({ name, arguments: args }),
  );
}

/**
 * Read the Set's locators.
 * @returns One entry per locator
 */
async function readLocators(): Promise<LocatorInfo[]> {
  const read = await call<{ locators?: LocatorInfo[] }>("ppal-read-live-set", {
    include: ["locators"],
  });

  return read.locators ?? [];
}

describe("ppal-update-live-set locator names with spaces", () => {
  it("deletes a locator whose name Live holds with a trailing space", async () => {
    await setConfig({ liveApiEnabled: true });

    const created = await call<{ locator?: { id: string } }>(
      "ppal-update-live-set",
      {
        locatorOperation: "create",
        locatorTime: "3|1",
        locatorName: "E2E Pad",
      },
    );
    const id = created.locator?.id;

    // The tools store names trimmed; a name typed in Live keeps its spaces.
    await call("ppal-live-api", {
      path: `id ${id}`,
      operations: [
        { type: "set-property", property: "name", value: "E2E Pad " },
      ],
    });
    await sleep(100);

    expect((await readLocators()).find((l) => l.id === id)?.name).toBe(
      "E2E Pad ",
    );

    const deleted = await call<{ locator?: { count?: number } }>(
      "ppal-update-live-set",
      { locatorOperation: "delete", locatorName: "E2E Pad" },
    );

    expect(deleted.locator?.count).toBe(1);

    await sleep(100);

    expect((await readLocators()).find((l) => l.id === id)).toBeUndefined();
  });
});

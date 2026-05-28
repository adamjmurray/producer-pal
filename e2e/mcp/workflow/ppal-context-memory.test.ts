// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-context tool (memory actions)
 * Tests memory read/write functionality via MCP protocol.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  extractToolResultText,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

/** Helper to call ppal-context with memory actions and return raw result */
async function callMemoryTool(
  action: "read" | "write",
  content?: string,
): Promise<unknown> {
  const args: { action: string; content?: string } = { action };

  if (content !== undefined) {
    args.content = content;
  }

  return ctx.client!.callTool({ name: "ppal-context", arguments: args });
}

describe("ppal-context (memory actions)", () => {
  it("reads current content", async () => {
    const TEST_CONTENT = "Read-only memory content for e2e testing";

    await setConfig({ memoryContent: TEST_CONTENT });

    const readResult = parseToolResult<MemoryResult>(
      await callMemoryTool("read"),
    );

    expect(readResult.content).toBe(TEST_CONTENT);
  });

  it("reads empty content when memory has been cleared", async () => {
    await setConfig({ memoryContent: "" });

    const readResult = parseToolResult<MemoryResult>(
      await callMemoryTool("read"),
    );

    expect(readResult.content).toBe("");
  });

  it("writes content and round-trips through read", async () => {
    const INITIAL_CONTENT = "Initial content for write test";
    const UPDATED_CONTENT = "Updated content from e2e test";

    await setConfig({ memoryContent: INITIAL_CONTENT });

    const writeResult = parseToolResult<MemoryResult>(
      await callMemoryTool("write", UPDATED_CONTENT),
    );

    expect(writeResult.content).toBe(UPDATED_CONTENT);

    const verifyResult = parseToolResult<MemoryResult>(
      await callMemoryTool("read"),
    );

    expect(verifyResult.content).toBe(UPDATED_CONTENT);
  });

  it("requires content for write action", async () => {
    await setConfig({ memoryContent: "Some content" });

    const response = extractToolResultText(await callMemoryTool("write"));

    expect(response).toContain("Content required for write action");
  });
});

/** Matches MemoryResult from context-helpers.ts */
interface MemoryResult {
  content: string;
}

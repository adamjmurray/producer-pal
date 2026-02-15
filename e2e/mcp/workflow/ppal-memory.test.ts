// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-session tool (memory actions)
 * Tests project notes read/write functionality via MCP protocol.
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

/** Helper to call ppal-session with memory actions and return raw result */
async function callMemoryTool(
  action: "read-memory" | "write-memory",
  content?: string,
): Promise<unknown> {
  const args: { action: string; content?: string } = { action };

  if (content !== undefined) {
    args.content = content;
  }

  return ctx.client!.callTool({ name: "ppal-session", arguments: args });
}

describe("ppal-session (memory actions)", () => {
  describe("disabled state", () => {
    it("returns enabled: false when project notes are disabled", async () => {
      await setConfig({ memoryEnabled: false, memoryContent: "" });
      const result = await callMemoryTool("read-memory");
      const parsed = parseToolResult<MemoryResult>(result);

      expect(parsed).toStrictEqual({ enabled: false });
    });
  });

  describe("read-only state", () => {
    it("reads content but rejects writes when not writable", async () => {
      const TEST_CONTENT = "Read-only project notes for e2e testing";

      await setConfig({
        memoryEnabled: true,
        memoryContent: TEST_CONTENT,
        memoryWritable: false,
      });

      // Read should work
      const readResult = parseToolResult<MemoryResult>(
        await callMemoryTool("read-memory"),
      );

      expect(readResult.enabled).toBe(true);
      expect(readResult.writable).toBe(false);
      expect(readResult.content).toBe(TEST_CONTENT);

      // Write should fail with descriptive error
      const writeResponse = extractToolResultText(
        await callMemoryTool("write-memory", "New content"),
      );

      expect(writeResponse).toContain("AI updates are disabled");
      expect(writeResponse).toContain("Allow AI updates");
    });
  });

  describe("writable state", () => {
    it("reads and writes content when fully enabled", async () => {
      const INITIAL_CONTENT = "Initial content for write test";
      const UPDATED_CONTENT = "Updated content from e2e test";

      await setConfig({
        memoryEnabled: true,
        memoryContent: INITIAL_CONTENT,
        memoryWritable: true,
      });

      // Read initial content
      const readResult = parseToolResult<MemoryResult>(
        await callMemoryTool("read-memory"),
      );

      expect(readResult.enabled).toBe(true);
      expect(readResult.writable).toBe(true);
      expect(readResult.content).toBe(INITIAL_CONTENT);

      // Write new content
      const writeResult = parseToolResult<MemoryResult>(
        await callMemoryTool("write-memory", UPDATED_CONTENT),
      );

      expect(writeResult.enabled).toBe(true);
      expect(writeResult.writable).toBe(true);
      expect(writeResult.content).toBe(UPDATED_CONTENT);

      // Verify read returns updated content
      const verifyResult = parseToolResult<MemoryResult>(
        await callMemoryTool("read-memory"),
      );

      expect(verifyResult.content).toBe(UPDATED_CONTENT);
    });

    it("requires content for write action", async () => {
      await setConfig({
        memoryEnabled: true,
        memoryContent: "Some content",
        memoryWritable: true,
      });

      // Write without content should fail
      const response = extractToolResultText(
        await callMemoryTool("write-memory"),
      );

      expect(response).toContain("Content required for write action");
    });
  });
});

/**
 * Type for ppal-memory result (matches memory.ts MemoryResult)
 */
interface MemoryResult {
  enabled: boolean;
  writable?: boolean;
  content?: string;
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for the ppal-context tool across its three scopes: project context
 * (the per-Live-Set blob), global context, and the memory collection.
 * Exercises read/write/delete via the MCP protocol.
 *
 * Run with: npm run e2e:mcp
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  extractToolResultText,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

/** Helper to call ppal-context project scope (the default) and return raw result */
async function callProjectContextTool(
  action: "read" | "write",
  content?: string,
): Promise<unknown> {
  const args: { action: string; content?: string } = { action };

  if (content !== undefined) {
    args.content = content;
  }

  return ctx.client!.callTool({ name: "ppal-context", arguments: args });
}

describe("ppal-context (project scope)", () => {
  it("reads current content", async () => {
    const TEST_CONTENT = "Read-only project context for e2e testing";

    await setConfig({ projectContext: TEST_CONTENT });

    const readResult = parseToolResult<ContentResult>(
      await callProjectContextTool("read"),
    );

    expect(readResult.content).toBe(TEST_CONTENT);
  });

  it("reads empty content when project context has been cleared", async () => {
    await setConfig({ projectContext: "" });

    const readResult = parseToolResult<ContentResult>(
      await callProjectContextTool("read"),
    );

    expect(readResult.content).toBe("");
  });

  it("writes content and round-trips through read", async () => {
    const INITIAL_CONTENT = "Initial content for write test";
    const UPDATED_CONTENT = "Updated content from e2e test";

    await setConfig({ projectContext: INITIAL_CONTENT });

    const writeResult = parseToolResult<ContentResult>(
      await callProjectContextTool("write", UPDATED_CONTENT),
    );

    expect(writeResult.content).toBe(UPDATED_CONTENT);

    const verifyResult = parseToolResult<ContentResult>(
      await callProjectContextTool("read"),
    );

    expect(verifyResult.content).toBe(UPDATED_CONTENT);
  });

  it("requires content for write action", async () => {
    await setConfig({ projectContext: "Some content" });

    const response = extractToolResultText(
      await callProjectContextTool("write"),
    );

    expect(response).toContain("Content required for write action");
  });
});

/** Call ppal-context with an explicit scope (global or memory). */
async function callContextTool(args: {
  action: string;
  scope: "global" | "memory";
  content?: string;
  name?: string;
  description?: string;
}): Promise<unknown> {
  return ctx.client!.callTool({ name: "ppal-context", arguments: args });
}

describe("ppal-context (global scope)", () => {
  it("round-trips a write through read, then restores the original", async () => {
    // Global context is a real file (~/.producer-pal/context.md), so snapshot
    // the developer's actual content and restore it afterward. An empty
    // original is restorable now that global writes accept "" — the behavior
    // this test guards against regressing.
    const original = parseToolResult<ContentResult>(
      await callContextTool({ action: "read", scope: "global" }),
    ).content;

    try {
      const testContent = `e2e global context ${randomUUID()}`;

      const written = parseToolResult<ContentResult>(
        await callContextTool({
          action: "write",
          scope: "global",
          content: testContent,
        }),
      );

      expect(written.content).toBe(testContent);

      const readBack = parseToolResult<ContentResult>(
        await callContextTool({ action: "read", scope: "global" }),
      );

      expect(readBack.content).toBe(testContent);
    } finally {
      await callContextTool({
        action: "write",
        scope: "global",
        content: original,
      });
    }

    const restored = parseToolResult<ContentResult>(
      await callContextTool({ action: "read", scope: "global" }),
    );

    expect(restored.content).toBe(original);
  });
});

describe("ppal-context (memory scope)", () => {
  it("writes, reads, reads the index, then deletes a uniquely-named entry", async () => {
    // A random name isolates this from the developer's real memories; the
    // finally-delete guarantees cleanup even if an assertion throws.
    const name = `e2e-test-${randomUUID()}`;
    const description = "e2e temporary memory (safe to delete)";
    const content = `e2e memory body ${randomUUID()}`;

    try {
      const written = parseToolResult<ContentResult>(
        await callContextTool({
          action: "write",
          scope: "memory",
          name,
          description,
          content,
        }),
      );

      expect(written.content).toContain(`Saved memory "${name}"`);

      const readBack = parseToolResult<ContentResult>(
        await callContextTool({ action: "read", scope: "memory", name }),
      );

      expect(readBack.content).toBe(content);

      // read with no name returns the whole index (folds in the old list action)
      const listed = parseToolResult<ContentResult>(
        await callContextTool({ action: "read", scope: "memory" }),
      );

      expect(listed.content).toContain(name);
      expect(listed.content).toContain(description);

      const deleted = parseToolResult<ContentResult>(
        await callContextTool({ action: "delete", scope: "memory", name }),
      );

      expect(deleted.content).toContain(`Deleted memory "${name}"`);

      const listedAfter = parseToolResult<ContentResult>(
        await callContextTool({ action: "read", scope: "memory" }),
      );

      expect(listedAfter.content).not.toContain(name);
    } finally {
      try {
        await callContextTool({ action: "delete", scope: "memory", name });
      } catch {
        console.warn(
          `e2e cleanup failed — manually delete ~/.producer-pal/memory/${name}.md`,
        );
      }
    }
  });
});

/** Matches ContentResult from context-helpers.ts */
interface ContentResult {
  content: string;
}

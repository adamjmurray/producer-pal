// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for the ppal-context tool across its three scopes: project context
 * (the per-Live-Set blob), global context, and the memory collection.
 * Exercises read/write/delete via the MCP protocol.
 *
 * Run with: npm run e2e:mcp
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_CONTEXT_CONTENT_LENGTH } from "#src/tools/constants.ts";
import {
  CONFIG_URL,
  extractToolResultText,
  getToolErrorMessage,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
} from "../mcp-test-helpers";
import {
  backupGlobalContext,
  restoreGlobalContext,
} from "./helpers/global-context-backup-test-helpers";

const ctx = setupMcpTestContext({ once: true });

/** Helper to call ppal-context project scope (the default) and return raw result */
async function callProjectContextTool(
  action: "read" | "write",
  content?: string,
  force?: boolean,
): Promise<unknown> {
  const args: { action: string; content?: string; force?: boolean } = {
    action,
  };

  if (content !== undefined) {
    args.content = content;
  }

  if (force !== undefined) {
    args.force = force;
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

  it("keeps the longest context the editor may save whole on the device", async () => {
    // 3-byte characters: the longest allowed context, in bytes, must still
    // reach the device in one piece.
    const longest = `${"€".repeat(MAX_CONTEXT_CONTENT_LENGTH - 3)}END`;

    await setConfig({ projectContext: longest });

    const read = parseToolResult<ContentResult>(
      await callProjectContextTool("read"),
    );

    expect(read.content).toBe(longest);

    const refused = await fetch(CONFIG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectContext: `${longest}!` }),
    });

    expect(refused.status).toBe(400);
    expect(
      parseToolResult<ContentResult>(await callProjectContextTool("read"))
        .content,
    ).toBe(longest);

    await setConfig({ projectContext: "" });
  });

  it("writes content and round-trips through read", async () => {
    const INITIAL_CONTENT = "Initial content for write test";
    const UPDATED_CONTENT = `${INITIAL_CONTENT}\nUpdated content from e2e test`;

    await setConfig({ projectContext: INITIAL_CONTENT });

    // Keeps a line of the document, so the clobber guard (tested below) stays
    // quiet.
    const writeResult = parseToolResult<ContentResult>(
      await callProjectContextTool("write", UPDATED_CONTENT),
    );

    expect(writeResult.content).toBe(UPDATED_CONTENT);

    const verifyResult = parseToolResult<ContentResult>(
      await callProjectContextTool("read"),
    );

    expect(verifyResult.content).toBe(UPDATED_CONTENT);
  });

  it("refuses an unforced write that keeps none of the existing document", async () => {
    const INITIAL_CONTENT = "- Genre: deep house.\n- Drop at bar 33.";

    await setConfig({ projectContext: INITIAL_CONTENT });

    // Thrown, not returned beside a warning: that reply has the shape of a
    // successful write.
    const message = getToolErrorMessage(
      await callProjectContextTool("write", "- Key: A minor."),
    );

    expect(message).toContain('write refused for scope "project"');
    expect(message).toContain("force:true");

    const verifyResult = parseToolResult<ContentResult>(
      await callProjectContextTool("read"),
    );

    expect(verifyResult.content).toBe(INITIAL_CONTENT);

    // The refusal left a record on the device. Spend it, so the next test
    // starts with none.
    await callProjectContextTool("write", "- Key: A minor.", true);
  });

  it("ignores force before any refusal, then honors it once one has warned", async () => {
    const INITIAL_CONTENT = "- Genre: deep house.\n- Drop at bar 33.";

    await setConfig({ projectContext: INITIAL_CONTENT });

    const message = getToolErrorMessage(
      await callProjectContextTool("write", "- Key: A minor.", true),
    );

    expect(message).toContain(
      "force:true ignored — nothing had warned about this yet.",
    );
    expect(message).toContain('write refused for scope "project"');

    const kept = parseToolResult<ContentResult>(
      await callProjectContextTool("read"),
    );

    expect(kept.content).toBe(INITIAL_CONTENT);

    // That refusal warned, so force now replaces the document.
    const written = parseToolResult<ContentResult>(
      await callProjectContextTool("write", "- Key: A minor.", true),
    );

    expect(written.content).toBe("- Key: A minor.");
  });

  it("ignores force when the document changed since the refusal", async () => {
    const INITIAL_CONTENT = "- Genre: deep house.\n- Drop at bar 33.";
    const CHANGED_CONTENT = "- Genre: jungle.\n- Drop at bar 17.";

    await setConfig({ projectContext: INITIAL_CONTENT });
    getToolErrorMessage(
      await callProjectContextTool("write", "- Key: A minor."),
    );

    await setConfig({ projectContext: CHANGED_CONTENT });

    const message = getToolErrorMessage(
      await callProjectContextTool("write", "- Key: A minor.", true),
    );

    expect(message).toContain(
      "force:true ignored — nothing had warned about this yet.",
    );

    const kept = parseToolResult<ContentResult>(
      await callProjectContextTool("read"),
    );

    expect(kept.content).toBe(CHANGED_CONTENT);

    // The refusal above warned about the changed document: spend it.
    await callProjectContextTool("write", "- Key: A minor.", true);
  });

  it("refuses name and description on a project write and leaves the document", async () => {
    const INITIAL_CONTENT = "- Genre: deep house.";

    await setConfig({ projectContext: INITIAL_CONTENT });

    const message = getToolErrorMessage(
      await ctx.client!.callTool({
        name: "ppal-context",
        arguments: {
          action: "write",
          name: "jungle-samples",
          description: "where the jungle samples live",
          content: "- Genre: jungle.",
        },
      }),
    );

    expect(message).toBe(
      'Error: name, description are only for scope "memory"; this call has scope "project". Change the scope or drop name, description.',
    );

    const verifyResult = parseToolResult<ContentResult>(
      await callProjectContextTool("read"),
    );

    expect(verifyResult.content).toBe(INITIAL_CONTENT);
  });

  it("refuses force on a read and leaves the document", async () => {
    const INITIAL_CONTENT = "- Genre: deep house.";

    await setConfig({ projectContext: INITIAL_CONTENT });

    const message = getToolErrorMessage(
      await ctx.client!.callTool({
        name: "ppal-context",
        arguments: { action: "read", force: true },
      }),
    );

    expect(message).toBe(
      'Error: force is only for action "write"; this call has action "read". Change the action or drop force.',
    );

    const verifyResult = parseToolResult<ContentResult>(
      await callProjectContextTool("read"),
    );

    expect(verifyResult.content).toBe(INITIAL_CONTENT);
  });

  it("says delete is memory-only on the project scope", async () => {
    const INITIAL_CONTENT = "- Genre: deep house.";

    await setConfig({ projectContext: INITIAL_CONTENT });

    const message = getToolErrorMessage(
      await ctx.client!.callTool({
        name: "ppal-context",
        arguments: { action: "delete" },
      }),
    );

    expect(message).toContain('action "delete" is only for scope "memory"');

    const verifyResult = parseToolResult<ContentResult>(
      await callProjectContextTool("read"),
    );

    expect(verifyResult.content).toBe(INITIAL_CONTENT);
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
  force?: boolean;
}): Promise<unknown> {
  return ctx.client!.callTool({ name: "ppal-context", arguments: args });
}

describe("ppal-context (global scope)", () => {
  // The per-test restores below don't survive a hard abort; this copy does.
  beforeAll(backupGlobalContext);
  afterAll(restoreGlobalContext);

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

      // The clobber guard refuses a replacement that keeps nothing of the
      // developer's document, and `force` only works after a refusal. An empty
      // write is never refused, so clear first.
      await replaceGlobal("");

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
      await replaceGlobal(original);
    }

    const restored = parseToolResult<ContentResult>(
      await callContextTool({ action: "read", scope: "global" }),
    );

    expect(restored.content).toBe(original);
  });

  it("ignores force before any refusal, then honors it once one has warned", async () => {
    const original = parseToolResult<ContentResult>(
      await callContextTool({ action: "read", scope: "global" }),
    ).content;
    const initial = `- e2e global line ${randomUUID()}`;

    try {
      await replaceGlobal(initial);

      const message = getToolErrorMessage(
        await callContextTool({
          action: "write",
          scope: "global",
          content: "- Prefers 90 BPM.",
          force: true,
        }),
      );

      expect(message).toContain(
        "force:true ignored — nothing had warned about this yet.",
      );
      expect(message).toContain('write refused for scope "global"');

      const kept = parseToolResult<ContentResult>(
        await callContextTool({ action: "read", scope: "global" }),
      );

      expect(kept.content).toBe(initial);

      // That refusal warned, so force now replaces the document.
      const written = parseToolResult<ContentResult>(
        await callContextTool({
          action: "write",
          scope: "global",
          content: "- Prefers 90 BPM.",
          force: true,
        }),
      );

      expect(written.content).toBe("- Prefers 90 BPM.");
    } finally {
      await replaceGlobal(original);
    }
  });

  it("ignores force when the document changed since the refusal", async () => {
    const original = parseToolResult<ContentResult>(
      await callContextTool({ action: "read", scope: "global" }),
    ).content;
    const write = {
      action: "write",
      scope: "global",
      content: "- Prefers 90 BPM.",
    } as const;

    try {
      await replaceGlobal(`- e2e global line ${randomUUID()}`);
      getToolErrorMessage(await callContextTool(write));

      const changed = `- e2e changed line ${randomUUID()}`;

      await replaceGlobal(changed);

      const message = getToolErrorMessage(
        await callContextTool({ ...write, force: true }),
      );

      expect(message).toContain(
        "force:true ignored — nothing had warned about this yet.",
      );

      const kept = parseToolResult<ContentResult>(
        await callContextTool({ action: "read", scope: "global" }),
      );

      expect(kept.content).toBe(changed);

      // The refusal above warned about the changed document: spend it.
      await callContextTool({ ...write, force: true });
    } finally {
      await replaceGlobal(original);
    }
  });
});

/** Replace the whole global document: clear it, which is never refused, then write. */
async function replaceGlobal(content: string): Promise<void> {
  await callContextTool({ action: "write", scope: "global", content: "" });

  if (content !== "") {
    await callContextTool({ action: "write", scope: "global", content });
  }
}

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

      const readBack = parseToolResult<MemoryNameEntry>(
        await callContextTool({ action: "read", scope: "memory", name }),
      );

      expect(readBack).toStrictEqual({ name, content });

      // read with no name returns the whole index (folds in the old list action)
      const listed = parseToolResult<ContentResult>(
        await callContextTool({ action: "read", scope: "memory" }),
      );

      expect(listed.content).toContain(name);
      expect(listed.content).toContain(description);

      // One name answers with its entry, unwrapped, and echoes no index.
      const deleted = parseToolResult<MemoryNameEntry>(
        await callContextTool({ action: "delete", scope: "memory", name }),
      );

      expect(deleted).toStrictEqual({ name });

      // Deleting it again has nothing to do, which is not an error.
      const deletedAgain = parseToolResult<MemoryNameEntry>(
        await callContextTool({ action: "delete", scope: "memory", name }),
      );

      expect(deletedAgain).toStrictEqual({
        name,
        detail: "nothing to delete",
      });

      // A lone read of a missing entry is an error.
      expect(
        getToolErrorMessage(
          await callContextTool({ action: "read", scope: "memory", name }),
        ),
      ).toContain(`No memory found for "${name}"`);

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

  it("reads and deletes several entries by a comma-separated name list", async () => {
    const id = randomUUID();
    const names = [`e2e-test-${id}-a`, `e2e-test-${id}-b`];
    const ghost = `e2e-test-${id}-ghost`;

    try {
      for (const name of names) {
        await callContextTool({
          action: "write",
          scope: "memory",
          name,
          description: "e2e temporary memory (safe to delete)",
          content: `body of ${name}`,
        });
      }

      const read = parseToolResult<MemoryNameEntry[]>(
        await callContextTool({
          action: "read",
          scope: "memory",
          name: `${names[0]},${ghost},${names[1]}`,
        }),
      );

      expect(read).toStrictEqual([
        { name: names[0], content: `body of ${names[0]}` },
        {
          name: ghost,
          ok: false,
          detail: `No memory found for "${ghost}".`,
        },
        { name: names[1], content: `body of ${names[1]}` },
      ]);

      const deleted = parseToolResult<MemoryNameEntry[]>(
        await callContextTool({
          action: "delete",
          scope: "memory",
          name: `${names[0]},${ghost},${names[1]}`,
        }),
      );

      expect(deleted).toStrictEqual([
        { name: names[0] },
        { name: ghost, detail: "nothing to delete" },
        { name: names[1] },
      ]);

      const listedAfter = parseToolResult<ContentResult>(
        await callContextTool({ action: "read", scope: "memory" }),
      );

      expect(listedAfter.content).not.toContain(id);
    } finally {
      try {
        await callContextTool({
          action: "delete",
          scope: "memory",
          name: names.join(","),
        });
      } catch {
        console.warn(
          `e2e cleanup failed — manually delete ~/.producer-pal/memory/e2e-test-${id}-*.md`,
        );
      }
    }
  });

  it("refuses a write name with a comma and stores nothing", async () => {
    const id = randomUUID();
    // Slugifies to this, which is where a write that got through would land.
    const slug = `e2e-test-${id}-breaks`;

    try {
      const message = getToolErrorMessage(
        await callContextTool({
          action: "write",
          scope: "memory",
          name: `e2e-test-${id}, breaks`,
          description: "e2e refused memory",
          content: "never stored",
        }),
      );

      expect(message).toContain(
        "has a comma; memory names can't contain one (read and delete use commas to list several)",
      );
      expect(
        getToolErrorMessage(
          await callContextTool({
            action: "read",
            scope: "memory",
            name: slug,
          }),
        ),
      ).toContain(`No memory found for "${slug}"`);
    } finally {
      try {
        await callContextTool({
          action: "delete",
          scope: "memory",
          name: slug,
        });
      } catch {
        console.warn(
          `e2e cleanup failed — manually delete ~/.producer-pal/memory/${slug}.md`,
        );
      }
    }
  });

  it("refuses an unusable name without naming the internal route", async () => {
    const message = getToolErrorMessage(
      await callContextTool({
        action: "write",
        scope: "memory",
        name: "!!!",
        description: "e2e refused memory",
        content: "never stored",
      }),
    );

    expect(message).toContain("name must contain letters or digits");
    expect(message).not.toContain("memory.remember");
  });
});

/** Matches MemoryNameEntry from memory-entry-operations.ts */
interface MemoryNameEntry {
  name: string;
  content?: string;
  ok?: false;
  detail?: string;
}

/** Matches ContentResult from project-context-operations.ts */
interface ContentResult {
  content: string;
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { context } from "../context.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");

describe("context - params the scope or action doesn't read", () => {
  let toolContext: Partial<ToolContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    toolContext = { projectContext: { content: "- Genre: deep house." } };
  });

  // The call that started it: no scope means project, and a project write
  // used to replace the document and drop name and description without a word.
  it("refuses name and description on a defaulted project write", async () => {
    await expect(
      context(
        {
          action: "write",
          name: "jungle-samples",
          description: "where the jungle samples live",
          content: "- Genre: jungle.",
        },
        toolContext,
      ),
    ).rejects.toThrow(
      'name, description are only for scope "memory"; this call has scope "project". Change the scope or drop name, description.',
    );

    expect(toolContext.projectContext!.content).toBe("- Genre: deep house.");
    expect(outlet).not.toHaveBeenCalled();
  });

  it("refuses name on the global scope without touching the document", async () => {
    await expect(
      context({ action: "read", scope: "global", name: "x" }),
    ).rejects.toThrow('name is only for scope "memory"');
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it("refuses description on a memory write only, not on a memory read", async () => {
    await expect(
      context({ action: "read", scope: "memory", description: "x" }),
    ).rejects.toThrow(
      'description is only for action "write"; this call has action "read"',
    );
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it.each(["read", "delete"])(
    "refuses content on a memory %s",
    async (action) => {
      await expect(
        context({ action, scope: "memory", name: "x", content: "body" }),
      ).rejects.toThrow('content is only for action "write"');
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    },
  );

  it("refuses content on a project read, which would have read and said nothing", async () => {
    await expect(
      context({ content: "- Key: A minor." }, toolContext),
    ).rejects.toThrow('content is only for action "write"');
  });

  it("lets a memory write take all three", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { content: "saved" },
    });

    await expect(
      context({
        action: "write",
        scope: "memory",
        name: "x",
        description: "hook",
        content: "body",
      }),
    ).resolves.toStrictEqual({ content: "saved" });
  });

  it("counts a blank name or description as not sent", async () => {
    await expect(
      context({ action: "read", name: "", description: "  " }, toolContext),
    ).resolves.toStrictEqual({ content: "- Genre: deep house." });
  });

  it.each(["project", "global"])(
    "says delete is memory-only on the %s scope",
    async (scope) => {
      await expect(context({ action: "delete", scope })).rejects.toThrow(
        `action "delete" is only for scope "memory", where it removes one entry by name. scope "${scope}" holds one document: use action "write" to replace it.`,
      );
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    },
  );

  it("says delete is memory-only before it names an unused param", async () => {
    await expect(
      context({ action: "delete", name: "x", content: "y" }, toolContext),
    ).rejects.toThrow('action "delete" is only for scope "memory"');
  });

  // Only the clobber guard on a project or global write reads it.
  it.each([
    ["a read", { action: "read" }],
    ["a global read", { action: "read", scope: "global" }],
    ["a memory write", { action: "write", scope: "memory", name: "x" }],
  ])("refuses force on %s", async (_label, args) => {
    await expect(
      context({ ...args, force: true } as never, toolContext),
    ).rejects.toThrow(
      /^force is only for (action "write"|scope "project" or "global")/,
    );
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it("names the action and scope force misses on, together", async () => {
    await expect(
      context({ action: "read", scope: "memory", force: true }),
    ).rejects.toThrow(
      'force is only for action "write" and scope "project" or "global"; this call has action "read" and scope "memory". Change the call or drop force.',
    );
  });

  it("lets a project or global write take force, and counts force:false as not sent", async () => {
    await expect(
      context(
        { action: "write", content: "- Key: A minor.", force: true },
        toolContext,
      ),
    ).resolves.toStrictEqual({ content: "- Key: A minor." });
    await expect(
      context({ action: "read", force: false }, toolContext),
    ).resolves.toBeDefined();
  });
});

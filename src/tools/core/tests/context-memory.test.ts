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

/**
 * Make requestNode resolve with a content payload.
 * @param content - The content string the route should return
 */
function mockNodeContent(content: string): void {
  vi.mocked(protocolMock.requestNode).mockResolvedValue({
    success: true,
    result: { content },
  });
}

describe("context - memory scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("read action", () => {
    it("reads one memory entry when a name is given", async () => {
      mockNodeContent("the fact");

      const result = await context({
        action: "read",
        scope: "memory",
        name: "prefers-c-minor",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.read", {
        name: "prefers-c-minor",
      });
      expect(result).toStrictEqual({ content: "the fact" });
    });

    it("reads the whole index when no name is given (folds in the old list action)", async () => {
      mockNodeContent("# Producer Pal Memory");

      const result = await context({ action: "read", scope: "memory" });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.list", {});
      expect(result).toStrictEqual({ content: "# Producer Pal Memory" });
    });
  });

  describe("write action", () => {
    it("passes name, description, and content through to the node route", async () => {
      mockNodeContent("index");

      await context({
        action: "write",
        scope: "memory",
        name: "loose-drums",
        description: "swing/humanize",
        content: "Apply groove.",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.remember", {
        name: "loose-drums",
        description: "swing/humanize",
        content: "Apply groove.",
      });
    });

    it.each([
      [
        { description: "d", content: "b" },
        "name required to write a memory entry",
      ],
      [
        { name: "x", description: "d" },
        "content required to write a memory entry",
      ],
      [
        { name: "x", content: "b" },
        "description required to write a memory entry",
      ],
      [
        { name: "x", content: "b", description: "   " },
        "description required to write a memory entry",
      ],
    ])(
      "rejects an incomplete write before touching the node route",
      async (extra, message) => {
        await expect(
          context({ action: "write", scope: "memory", ...extra }),
        ).rejects.toThrow(message);
        expect(protocolMock.requestNode).not.toHaveBeenCalled();
      },
    );
  });

  describe("delete action", () => {
    it("deletes a memory entry by name", async () => {
      mockNodeContent("index");

      await context({ action: "delete", scope: "memory", name: "stale" });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.forget", {
        name: "stale",
      });
    });

    it("rejects a delete with no name", async () => {
      await expect(
        context({ action: "delete", scope: "memory" }),
      ).rejects.toThrow("name required to delete a memory entry");
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });
  });

  it("throws for an unknown action under the memory scope", async () => {
    await expect(context({ action: "nope", scope: "memory" })).rejects.toThrow(
      "Unknown action for scope:memory: nope",
    );
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });
});

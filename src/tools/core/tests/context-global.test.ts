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

describe("context - global scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("read action", () => {
    it("round-trips to the globalContext.read node route", async () => {
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: true,
        result: { content: "global facts" },
      });

      const result = await context({ action: "read", scope: "global" });

      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "globalContext.read",
        {},
      );
      expect(result).toStrictEqual({ content: "global facts" });
      // The project outlet path must not fire for a global read.
      expect(outlet).not.toHaveBeenCalled();
    });

    it("throws when the node route reports failure", async () => {
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: false,
        error: "disk on fire",
      });

      await expect(
        context({ action: "read", scope: "global" }),
      ).rejects.toThrow("globalContext.read failed: disk on fire");
    });
  });

  describe("write action", () => {
    it("round-trips to the globalContext.write node route and echoes stored content", async () => {
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: true,
        result: { content: "new global facts" },
      });

      const result = await context({
        action: "write",
        scope: "global",
        content: "new global facts",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "globalContext.write",
        { content: "new global facts" },
      );
      expect(result).toStrictEqual({ content: "new global facts" });
      // Global writes go over the RPC bridge, not the project update_memory outlet.
      expect(outlet).not.toHaveBeenCalled();
    });

    it("rejects an empty write before touching the node route", async () => {
      await expect(
        context({ action: "write", scope: "global", content: "" }),
      ).rejects.toThrow("Content required for write action");
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });

    it("throws when the node route reports failure", async () => {
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: false,
        error: "permission denied",
      });

      await expect(
        context({ action: "write", scope: "global", content: "x" }),
      ).rejects.toThrow("globalContext.write failed: permission denied");
    });
  });

  it("throws for an unknown action under the global scope", async () => {
    await expect(context({ action: "nope", scope: "global" })).rejects.toThrow(
      "Unknown action: nope",
    );
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  describe("memory actions", () => {
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

    it("reads one memory entry when a name is given", async () => {
      mockNodeContent("the fact");

      const result = await context({
        action: "read",
        scope: "global",
        name: "prefers-c-minor",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.read", {
        name: "prefers-c-minor",
      });
      expect(result).toStrictEqual({ content: "the fact" });
    });

    it("remembers a memory, defaulting a missing description to ''", async () => {
      mockNodeContent("index");

      await context({
        action: "remember",
        scope: "global",
        name: "loose drums",
        type: "feedback",
        content: "Apply groove.",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.remember", {
        name: "loose drums",
        type: "feedback",
        description: "",
        content: "Apply groove.",
      });
    });

    it("passes the description through when provided", async () => {
      mockNodeContent("index");

      await context({
        action: "remember",
        scope: "global",
        name: "loose-drums",
        type: "feedback",
        description: "swing/humanize",
        content: "Apply groove.",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "memory.remember",
        expect.objectContaining({ description: "swing/humanize" }),
      );
    });

    it.each([
      [{ type: "user", content: "b" }, "name required for remember action"],
      [{ name: "x", content: "b" }, "type required for remember action"],
      [{ name: "x", type: "user" }, "content required for remember action"],
    ])(
      "rejects an incomplete remember before touching the node route",
      async (extra, message) => {
        await expect(
          context({ action: "remember", scope: "global", ...extra }),
        ).rejects.toThrow(message);
        expect(protocolMock.requestNode).not.toHaveBeenCalled();
      },
    );

    it("forgets a memory by name", async () => {
      mockNodeContent("index");

      await context({ action: "forget", scope: "global", name: "stale" });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.forget", {
        name: "stale",
      });
    });

    it("rejects a forget with no name", async () => {
      await expect(
        context({ action: "forget", scope: "global" }),
      ).rejects.toThrow("name required for forget action");
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });

    it("lists the memory index", async () => {
      mockNodeContent("# Producer Pal Memory");

      const result = await context({ action: "list", scope: "global" });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.list", {});
      expect(result).toStrictEqual({ content: "# Producer Pal Memory" });
    });
  });
});

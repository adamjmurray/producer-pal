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

    it("rejects a read with no name (name is required for scope:memory)", async () => {
      await expect(
        context({ action: "read", scope: "memory" }),
      ).rejects.toThrow("name required to read a memory");
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });
  });

  describe("remember action", () => {
    it("remembers a memory, defaulting a missing description to ''", async () => {
      mockNodeContent("index");

      await context({
        action: "remember",
        scope: "memory",
        name: "loose drums",
        content: "Apply groove.",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.remember", {
        name: "loose drums",
        description: "",
        content: "Apply groove.",
      });
    });

    it("passes the description through when provided", async () => {
      mockNodeContent("index");

      await context({
        action: "remember",
        scope: "memory",
        name: "loose-drums",
        description: "swing/humanize",
        content: "Apply groove.",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "memory.remember",
        expect.objectContaining({ description: "swing/humanize" }),
      );
    });

    it.each([
      [{ content: "b" }, "name required for remember action"],
      [{ name: "x" }, "content required for remember action"],
    ])(
      "rejects an incomplete remember before touching the node route",
      async (extra, message) => {
        await expect(
          context({ action: "remember", scope: "memory", ...extra }),
        ).rejects.toThrow(message);
        expect(protocolMock.requestNode).not.toHaveBeenCalled();
      },
    );
  });

  describe("forget action", () => {
    it("forgets a memory by name", async () => {
      mockNodeContent("index");

      await context({ action: "forget", scope: "memory", name: "stale" });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.forget", {
        name: "stale",
      });
    });

    it("rejects a forget with no name", async () => {
      await expect(
        context({ action: "forget", scope: "memory" }),
      ).rejects.toThrow("name required for forget action");
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });
  });

  it("lists the memory index", async () => {
    mockNodeContent("# Producer Pal Memory");

    const result = await context({ action: "list", scope: "memory" });

    expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.list", {});
    expect(result).toStrictEqual({ content: "# Producer Pal Memory" });
  });

  it("rejects write under the memory scope (write is the blob-scope action)", async () => {
    await expect(
      context({ action: "write", scope: "memory", content: "x" }),
    ).rejects.toThrow("Unknown action for scope:memory: write");
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it("throws for an unknown action under the memory scope", async () => {
    await expect(context({ action: "nope", scope: "memory" })).rejects.toThrow(
      "Unknown action for scope:memory: nope",
    );
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });
});

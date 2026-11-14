// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { context } from "../context.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const protocolMock =
  await import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts");

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

/**
 * Make requestNode resolve with a many-name payload.
 * @param entries - The entries the route should return
 */
function mockEntries(entries: object[]): void {
  vi.mocked(protocolMock.requestNode).mockResolvedValue({
    success: true,
    result: { entries },
  });
}

describe("context - memory scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("read action", () => {
    it("reads one memory entry unwrapped when one name is given", async () => {
      mockEntries([{ name: "prefers-c-minor", content: "the fact" }]);

      const result = await context({
        action: "read",
        scope: "memory",
        name: "prefers-c-minor",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.readMany", {
        names: ["prefers-c-minor"],
      });
      expect(result).toStrictEqual({
        name: "prefers-c-minor",
        content: "the fact",
      });
    });

    it("throws when the one name asked for isn't there", async () => {
      mockEntries([
        { name: "ghost", ok: false, detail: 'No memory found for "ghost".' },
      ]);

      await expect(
        context({ action: "read", scope: "memory", name: "ghost" }),
      ).rejects.toThrow('No memory found for "ghost".');
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
    it("deletes one memory entry by name, unwrapped, with no index", async () => {
      mockEntries([{ name: "stale" }]);

      const result = await context({
        action: "delete",
        scope: "memory",
        name: "stale",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "memory.forgetMany",
        { names: ["stale"] },
      );
      expect(result).toStrictEqual({ name: "stale" });
    });

    it("answers a delete of one missing name as satisfied, not an error", async () => {
      mockEntries([{ name: "ghost", detail: "nothing to delete" }]);

      const result = await context({
        action: "delete",
        scope: "memory",
        name: "ghost",
      });

      expect(result).toStrictEqual({
        name: "ghost",
        detail: "nothing to delete",
      });
    });

    it("throws when the one name being deleted fails", async () => {
      mockEntries([{ name: "bad", ok: false, detail: "disk delete failed" }]);

      await expect(
        context({ action: "delete", scope: "memory", name: "bad" }),
      ).rejects.toThrow("disk delete failed");
    });

    it("rejects a delete with no name", async () => {
      await expect(
        context({ action: "delete", scope: "memory" }),
      ).rejects.toThrow("name required to delete a memory entry");
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });
  });

  describe("several names", () => {
    const entries = [
      { name: "a", content: "body a" },
      { name: "ghost", ok: false, detail: 'No memory found for "ghost".' },
    ];

    it("reads each name in one call, a missing one among found ones", async () => {
      mockEntries(entries);

      const result = await context({
        action: "read",
        scope: "memory",
        name: "a, ghost",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledTimes(1);
      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.readMany", {
        names: ["a", "ghost"],
      });
      expect(result).toStrictEqual(entries);
    });

    it("sends duplicate names as named, in order", async () => {
      mockEntries([]);

      await context({ action: "read", scope: "memory", name: "a,b,a" });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.readMany", {
        names: ["a", "b", "a"],
      });
    });

    it("keeps an escaped comma inside one name", async () => {
      mockEntries([]);

      await context({ action: "read", scope: "memory", name: "a\\,b,c" });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.readMany", {
        names: ["a,b", "c"],
      });
    });

    it("reads one name, unwrapped, even with an escaped comma and a trailing comma", async () => {
      mockEntries([{ name: "a,b", content: "the fact" }]);

      const result = await context({
        action: "read",
        scope: "memory",
        name: "a\\,b,",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.readMany", {
        names: ["a,b"],
      });
      expect(result).toStrictEqual({ name: "a,b", content: "the fact" });
    });

    it("reads the index for a blank name", async () => {
      mockNodeContent("index");

      await context({ action: "read", scope: "memory", name: "  " });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("memory.list", {});
    });

    it("deletes each name in one call", async () => {
      const deleted = [
        { name: "a" },
        { name: "ghost", detail: "nothing to delete" },
      ];

      mockEntries(deleted);

      const result = await context({
        action: "delete",
        scope: "memory",
        name: "a,ghost",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "memory.forgetMany",
        { names: ["a", "ghost"] },
      );
      expect(result).toStrictEqual(deleted);
    });

    it("refuses an empty entry before touching the node route", async () => {
      await expect(
        context({ action: "delete", scope: "memory", name: "a,,b" }),
      ).rejects.toThrow('invalid name "a,,b" - it has an empty entry');
      await expect(
        context({ action: "read", scope: "memory", name: "," }),
      ).rejects.toThrow('invalid name "," - it names nothing');
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });

    it("refuses a write name over 200 characters", async () => {
      await expect(
        context({
          action: "write",
          scope: "memory",
          name: "a".repeat(201),
          description: "d",
          content: "c",
        }),
      ).rejects.toThrow("name is 201 characters; a memory name is at most 200");
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });

    it.each(["jungle, breaks", "a,b", "a\\,b", ","])(
      "refuses a write name with a comma: %s",
      async (name) => {
        await expect(
          context({
            action: "write",
            scope: "memory",
            name,
            description: "d",
            content: "c",
          }),
        ).rejects.toThrow(
          `name "${name}" has a comma; memory names can't contain one (read and delete use commas to list several)`,
        );
        expect(protocolMock.requestNode).not.toHaveBeenCalled();
      },
    );

    it("throws when the node route reports failure", async () => {
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: false,
        error: "boom",
      });

      await expect(
        context({ action: "read", scope: "memory", name: "a,b" }),
      ).rejects.toThrow("boom");
    });
  });

  it("throws for an unknown action under the memory scope", async () => {
    await expect(context({ action: "nope", scope: "memory" })).rejects.toThrow(
      "Unknown action for scope:memory: nope",
    );
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it("throws when the node route reports failure, defaulting the error text", async () => {
    // success:false with a truthy result still fails (|| not &&); the absent
    // error field falls back to "unknown error".
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: false,
      result: { content: "ignored" },
    });

    await expect(
      context({ action: "read", scope: "memory", name: "x" }),
    ).rejects.toThrow("unknown error");
  });
});

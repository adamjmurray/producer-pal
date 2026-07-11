// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { context } from "../context.ts";

describe("context - project scope (default)", () => {
  let toolContext: Partial<ToolContext>;

  beforeEach(() => {
    toolContext = {
      memory: { content: "" },
    };
  });

  describe("read action", () => {
    it("returns current content", async () => {
      toolContext.memory!.content = "test content";

      const result = await context({ action: "read" }, toolContext);

      expect(result).toStrictEqual({ content: "test content" });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("returns empty string when memory is missing", async () => {
      const result = await context({ action: "read" }, {});

      expect(result).toStrictEqual({ content: "" });
      expect(outlet).not.toHaveBeenCalled();
    });
  });

  describe("write action", () => {
    it("throws error when content is missing", async () => {
      await expect(context({ action: "write" }, toolContext)).rejects.toThrow(
        "Content required for write action",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("clears content when content is an empty string", async () => {
      toolContext.memory!.content = "existing content";

      const result = await context(
        { action: "write", content: "" },
        toolContext,
      );

      expect(toolContext.memory!.content).toBe("");
      expect(result).toStrictEqual({ content: "" });
      expect(outlet).toHaveBeenCalledWith(0, "update_memory", "");
    });

    it.each([
      ["updates content when memory is present", ""],
      ["overwrites existing content", "old content"],
    ])("%s", async (_, initialContent) => {
      if (initialContent) toolContext.memory!.content = initialContent;

      const result = await context(
        { action: "write", content: "new content" },
        toolContext,
      );

      expect(toolContext.memory!.content).toBe("new content");
      expect(result).toStrictEqual({ content: "new content" });
      expect(outlet).toHaveBeenCalledWith(0, "update_memory", "new content");
    });

    it("writes content via outlet even when memory context is missing", async () => {
      const result = await context({ action: "write", content: "fresh" }, {});

      expect(result).toStrictEqual({ content: "fresh" });
      expect(outlet).toHaveBeenCalledWith(0, "update_memory", "fresh");
    });
  });

  it("throws error for unknown action", async () => {
    await expect(context({ action: "unknown-action" })).rejects.toThrow(
      "Unknown action for scope:project: unknown-action",
    );
  });

  it("fails safe: delete (a memory-only verb) with no scope errors instead of touching project context", async () => {
    await expect(
      context({ action: "delete", name: "x" }, toolContext),
    ).rejects.toThrow("Unknown action for scope:project: delete");
    expect(outlet).not.toHaveBeenCalled();
  });
});

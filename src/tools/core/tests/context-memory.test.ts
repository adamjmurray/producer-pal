// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { context } from "../context.ts";

describe("context - memory actions", () => {
  let toolContext: Partial<ToolContext>;

  beforeEach(() => {
    toolContext = {
      memory: { content: "" },
    };
  });

  describe("read action", () => {
    it("returns current content", () => {
      toolContext.memory!.content = "test content";

      const result = context({ action: "read" }, toolContext);

      expect(result).toStrictEqual({ content: "test content" });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("returns empty string when memory is missing", () => {
      const result = context({ action: "read" }, {});

      expect(result).toStrictEqual({ content: "" });
      expect(outlet).not.toHaveBeenCalled();
    });
  });

  describe("write action", () => {
    it("throws error when content is missing", () => {
      expect(() => context({ action: "write" }, toolContext)).toThrow(
        "Content required for write action",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("throws error when content is empty string", () => {
      expect(() =>
        context({ action: "write", content: "" }, toolContext),
      ).toThrow("Content required for write action");
      expect(outlet).not.toHaveBeenCalled();
    });

    it.each([
      ["updates content when memory is present", ""],
      ["overwrites existing content", "old content"],
    ])("%s", (_, initialContent) => {
      if (initialContent) toolContext.memory!.content = initialContent;

      const result = context(
        { action: "write", content: "new content" },
        toolContext,
      );

      expect(toolContext.memory!.content).toBe("new content");
      expect(result).toStrictEqual({ content: "new content" });
      expect(outlet).toHaveBeenCalledWith(0, "update_memory", "new content");
    });

    it("writes content via outlet even when memory context is missing", () => {
      const result = context({ action: "write", content: "fresh" }, {});

      expect(result).toStrictEqual({ content: "fresh" });
      expect(outlet).toHaveBeenCalledWith(0, "update_memory", "fresh");
    });
  });

  it("throws error for unknown action", () => {
    expect(() => context({ action: "unknown-action" })).toThrow(
      "Unknown action: unknown-action",
    );
  });
});

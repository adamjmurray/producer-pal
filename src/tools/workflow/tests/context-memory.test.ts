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
      memory: {
        enabled: false,
        writable: false,
        content: "",
      },
    };
  });

  describe("read action", () => {
    it("returns enabled: false when project context is disabled", () => {
      toolContext.memory!.enabled = false;
      const result = context({ action: "read" }, toolContext);

      expect(result).toStrictEqual({ enabled: false });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("returns enabled: false when memory is missing", () => {
      const result = context({ action: "read" }, {});

      expect(result).toStrictEqual({ enabled: false });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("returns full context when project context is enabled", () => {
      toolContext.memory!.enabled = true;
      toolContext.memory!.writable = true;
      toolContext.memory!.content = "test content";

      const result = context({ action: "read" }, toolContext);

      expect(result).toStrictEqual({
        enabled: true,
        writable: true,
        content: "test content",
      });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("returns full context with writable false when not writable", () => {
      toolContext.memory!.enabled = true;
      toolContext.memory!.writable = false;
      toolContext.memory!.content = "test content";

      const result = context({ action: "read" }, toolContext);

      expect(result).toStrictEqual({
        enabled: true,
        writable: false,
        content: "test content",
      });
      expect(outlet).not.toHaveBeenCalled();
    });
  });

  describe("write action", () => {
    it("throws error when project context is disabled", () => {
      toolContext.memory!.enabled = false;
      expect(() =>
        context({ action: "write", content: "test" }, toolContext),
      ).toThrow("Project context is disabled");
      expect(outlet).not.toHaveBeenCalled();
    });

    it("throws error when memory is missing", () => {
      expect(() => context({ action: "write", content: "test" }, {})).toThrow(
        "Project context is disabled",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("throws error when project context is not writable", () => {
      toolContext.memory!.enabled = true;
      toolContext.memory!.writable = false;
      expect(() =>
        context({ action: "write", content: "test" }, toolContext),
      ).toThrow(
        "AI updates are disabled - enable 'Allow AI updates' in settings to let AI modify project context",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("throws error when content is missing", () => {
      toolContext.memory!.enabled = true;
      toolContext.memory!.writable = true;
      expect(() => context({ action: "write" }, toolContext)).toThrow(
        "Content required for write action",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("throws error when content is empty string", () => {
      toolContext.memory!.enabled = true;
      toolContext.memory!.writable = true;
      expect(() =>
        context({ action: "write", content: "" }, toolContext),
      ).toThrow("Content required for write action");
      expect(outlet).not.toHaveBeenCalled();
    });

    it.each([
      ["updates content when all conditions are met", ""],
      ["overwrites existing content", "old content"],
    ])("%s", (_, initialContent) => {
      toolContext.memory!.enabled = true;
      toolContext.memory!.writable = true;
      if (initialContent) toolContext.memory!.content = initialContent;

      const result = context(
        { action: "write", content: "new content" },
        toolContext,
      );

      expect(toolContext.memory!.content).toBe("new content");
      expect(result).toStrictEqual({
        enabled: true,
        writable: true,
        content: "new content",
      });
      expect(outlet).toHaveBeenCalledWith(0, "update_memory", "new content");
    });
  });

  it("throws error for unknown action", () => {
    expect(() => context({ action: "unknown-action" })).toThrow(
      "Unknown action: unknown-action",
    );
  });
});

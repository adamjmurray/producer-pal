// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { memory } from "../memory.ts";

describe("memory", () => {
  let context: Partial<ToolContext>;

  beforeEach(() => {
    context = {
      memory: {
        enabled: false,
        writable: false,
        content: "",
      },
    };
  });

  describe("input validation", () => {
    it("should throw error when action is missing", () => {
      expect(() => memory({}, context)).toThrow("Action is required");
    });

    it("should throw error when action is invalid", () => {
      expect(() => memory({ action: "invalid" }, context)).toThrow(
        "Action must be 'read' or 'write'",
      );
    });

    it("should return enabled: false when projectNotes is missing", () => {
      const result = memory({ action: "read" }, {});

      expect(result).toStrictEqual({ enabled: false });
    });

    it("should return enabled: false when context is empty", () => {
      const result = memory({ action: "write", content: "test" }, {});

      expect(result).toStrictEqual({ enabled: false });
    });
  });

  describe("read action", () => {
    it("should return only enabled: false when project context is disabled", () => {
      context.memory!.enabled = false;
      const result = memory({ action: "read" }, context);

      expect(result).toStrictEqual({ enabled: false });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should return full context when project context is enabled", () => {
      context.memory!.enabled = true;
      context.memory!.writable = true;
      context.memory!.content = "test content";

      const result = memory({ action: "read" }, context);

      expect(result).toStrictEqual({
        enabled: true,
        writable: true,
        content: "test content",
      });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should return full context with writable false when not writable", () => {
      context.memory!.enabled = true;
      context.memory!.writable = false;
      context.memory!.content = "test content";

      const result = memory({ action: "read" }, context);

      expect(result).toStrictEqual({
        enabled: true,
        writable: false,
        content: "test content",
      });
      expect(outlet).not.toHaveBeenCalled();
    });
  });

  describe("write action", () => {
    it("should throw error when project context is disabled", () => {
      context.memory!.enabled = false;
      expect(() =>
        memory({ action: "write", content: "test" }, context),
      ).toThrow("Project context is disabled");
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should throw error when project context is not writable", () => {
      context.memory!.enabled = true;
      context.memory!.writable = false;
      expect(() =>
        memory({ action: "write", content: "test" }, context),
      ).toThrow(
        "AI updates are disabled - enable 'Allow AI updates' in settings to let AI modify project context",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should throw error when content is missing", () => {
      context.memory!.enabled = true;
      context.memory!.writable = true;
      expect(() => memory({ action: "write" }, context)).toThrow(
        "Content required for write action",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should throw error when content is empty string", () => {
      context.memory!.enabled = true;
      context.memory!.writable = true;
      expect(() => memory({ action: "write", content: "" }, context)).toThrow(
        "Content required for write action",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it.each([
      ["updates content when all conditions are met", ""],
      ["overwrites existing content", "old content"],
    ])("%s", (_, initialContent) => {
      context.memory!.enabled = true;
      context.memory!.writable = true;
      if (initialContent) context.memory!.content = initialContent;

      const result = memory(
        { action: "write", content: "new content" },
        context,
      );

      expect(context.memory!.content).toBe("new content");
      expect(result).toStrictEqual({
        enabled: true,
        writable: true,
        content: "new content",
      });
      expect(outlet).toHaveBeenCalledWith(0, "updatenotes", "new content");
    });
  });
});

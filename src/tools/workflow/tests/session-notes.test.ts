// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { session } from "../session.ts";

describe("session - memory actions", () => {
  let context: Partial<ToolContext>;

  beforeEach(() => {
    context = {
      projectNotes: {
        enabled: false,
        writable: false,
        content: "",
      },
    };
  });

  describe("read-memory action", () => {
    it("returns enabled: false when project context is disabled", () => {
      context.projectNotes!.enabled = false;
      const result = session({ action: "read-memory" }, context);

      expect(result).toStrictEqual({ enabled: false });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("returns enabled: false when projectNotes is missing", () => {
      const result = session({ action: "read-memory" }, {});

      expect(result).toStrictEqual({ enabled: false });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("returns full context when project context is enabled", () => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = true;
      context.projectNotes!.content = "test content";

      const result = session({ action: "read-memory" }, context);

      expect(result).toStrictEqual({
        enabled: true,
        writable: true,
        content: "test content",
      });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("returns full context with writable false when not writable", () => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = false;
      context.projectNotes!.content = "test content";

      const result = session({ action: "read-memory" }, context);

      expect(result).toStrictEqual({
        enabled: true,
        writable: false,
        content: "test content",
      });
      expect(outlet).not.toHaveBeenCalled();
    });
  });

  describe("write-memory action", () => {
    it("throws error when project context is disabled", () => {
      context.projectNotes!.enabled = false;
      expect(() =>
        session({ action: "write-memory", content: "test" }, context),
      ).toThrow("Project context is disabled");
      expect(outlet).not.toHaveBeenCalled();
    });

    it("throws error when projectNotes is missing", () => {
      expect(() =>
        session({ action: "write-memory", content: "test" }, {}),
      ).toThrow("Project context is disabled");
      expect(outlet).not.toHaveBeenCalled();
    });

    it("throws error when project context is not writable", () => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = false;
      expect(() =>
        session({ action: "write-memory", content: "test" }, context),
      ).toThrow(
        "AI updates are disabled - enable 'Allow AI updates' in settings to let AI modify project context",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("throws error when content is missing", () => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = true;
      expect(() => session({ action: "write-memory" }, context)).toThrow(
        "Content required for write action",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("throws error when content is empty string", () => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = true;
      expect(() =>
        session({ action: "write-memory", content: "" }, context),
      ).toThrow("Content required for write action");
      expect(outlet).not.toHaveBeenCalled();
    });

    it.each([
      ["updates content when all conditions are met", ""],
      ["overwrites existing content", "old content"],
    ])("%s", (_, initialContent) => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = true;
      if (initialContent) context.projectNotes!.content = initialContent;

      const result = session(
        { action: "write-memory", content: "new content" },
        context,
      );

      expect(context.projectNotes!.content).toBe("new content");
      expect(result).toStrictEqual({
        enabled: true,
        writable: true,
        content: "new content",
      });
      expect(outlet).toHaveBeenCalledWith(0, "updatenotes", "new content");
    });
  });
});

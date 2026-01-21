import { beforeEach, describe, expect, it } from "vitest";
import { memory } from "./memory.ts";

describe("memory", () => {
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
      context.projectNotes!.enabled = false;
      const result = memory({ action: "read" }, context);

      expect(result).toStrictEqual({ enabled: false });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should return full context when project context is enabled", () => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = true;
      context.projectNotes!.content = "test content";

      const result = memory({ action: "read" }, context);

      expect(result).toStrictEqual({
        enabled: true,
        writable: true,
        content: "test content",
      });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should return full context with writable false when not writable", () => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = false;
      context.projectNotes!.content = "test content";

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
      context.projectNotes!.enabled = false;
      expect(() =>
        memory({ action: "write", content: "test" }, context),
      ).toThrow("Project context is disabled");
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should throw error when project context is not writable", () => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = false;
      expect(() =>
        memory({ action: "write", content: "test" }, context),
      ).toThrow(
        "AI updates are disabled - enable 'Allow AI updates' in settings to let AI modify project context",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should throw error when content is missing", () => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = true;
      expect(() => memory({ action: "write" }, context)).toThrow(
        "Content required for write action",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should throw error when content is empty string", () => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = true;
      expect(() => memory({ action: "write", content: "" }, context)).toThrow(
        "Content required for write action",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it.each([
      ["updates content when all conditions are met", ""],
      ["overwrites existing content", "old content"],
    ])("%s", (_, initialContent) => {
      context.projectNotes!.enabled = true;
      context.projectNotes!.writable = true;
      if (initialContent) context.projectNotes!.content = initialContent;

      const result = memory(
        { action: "write", content: "new content" },
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

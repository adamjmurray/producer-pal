import { beforeEach, describe, expect, it } from "vitest";
import { memory } from "./memory.js";

describe("memory", () => {
  let context;

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
  });

  describe("read action", () => {
    it("should return only enabled: false when project context is disabled", () => {
      context.projectNotes.enabled = false;
      const result = memory({ action: "read" }, context);

      expect(result).toEqual({ enabled: false });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should return full context when project context is enabled", () => {
      context.projectNotes.enabled = true;
      context.projectNotes.writable = true;
      context.projectNotes.content = "test content";

      const result = memory({ action: "read" }, context);

      expect(result).toEqual({
        enabled: true,
        writable: true,
        content: "test content",
      });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should return full context with writable false when not writable", () => {
      context.projectNotes.enabled = true;
      context.projectNotes.writable = false;
      context.projectNotes.content = "test content";

      const result = memory({ action: "read" }, context);

      expect(result).toEqual({
        enabled: true,
        writable: false,
        content: "test content",
      });
      expect(outlet).not.toHaveBeenCalled();
    });
  });

  describe("write action", () => {
    it("should throw error when project context is disabled", () => {
      context.projectNotes.enabled = false;
      expect(() =>
        memory({ action: "write", content: "test" }, context),
      ).toThrow("Project context is disabled");
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should throw error when project context is not writable", () => {
      context.projectNotes.enabled = true;
      context.projectNotes.writable = false;
      expect(() =>
        memory({ action: "write", content: "test" }, context),
      ).toThrow(
        "AI updates are disabled - enable 'Allow AI updates' in settings to let AI modify project context",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should throw error when content is missing", () => {
      context.projectNotes.enabled = true;
      context.projectNotes.writable = true;
      expect(() => memory({ action: "write" }, context)).toThrow(
        "Content required for write action",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should throw error when content is empty string", () => {
      context.projectNotes.enabled = true;
      context.projectNotes.writable = true;
      expect(() => memory({ action: "write", content: "" }, context)).toThrow(
        "Content required for write action",
      );
      expect(outlet).not.toHaveBeenCalled();
    });

    it("should update content when all conditions are met", () => {
      context.projectNotes.enabled = true;
      context.projectNotes.writable = true;

      const result = memory(
        { action: "write", content: "new content" },
        context,
      );

      expect(context.projectNotes.content).toBe("new content");
      expect(result).toEqual({
        enabled: true,
        writable: true,
        content: "new content",
      });
      expect(outlet).toHaveBeenCalledWith(0, "updatenotes", "new content");
    });

    it("should overwrite existing content", () => {
      context.projectNotes.enabled = true;
      context.projectNotes.writable = true;
      context.projectNotes.content = "old content";

      const result = memory(
        { action: "write", content: "new content" },
        context,
      );

      expect(context.projectNotes.content).toBe("new content");
      expect(result).toEqual({
        enabled: true,
        writable: true,
        content: "new content",
      });
      expect(outlet).toHaveBeenCalledWith(0, "updatenotes", "new content");
    });
  });
});

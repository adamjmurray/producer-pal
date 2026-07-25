// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as v8Console from "#src/shared/v8-max-console.ts";
import { context } from "../context.ts";

describe("context - project scope (default)", () => {
  let toolContext: Partial<ToolContext>;

  beforeEach(() => {
    toolContext = {
      projectContext: { content: "" },
    };
  });

  describe("read action", () => {
    it("returns current content", async () => {
      toolContext.projectContext!.content = "test content";

      const result = await context({ action: "read" }, toolContext);

      expect(result).toStrictEqual({ content: "test content" });
      expect(outlet).not.toHaveBeenCalled();
    });

    it("returns empty string when project context is missing", async () => {
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
      toolContext.projectContext!.content = "existing content";

      const result = await context(
        { action: "write", content: "" },
        toolContext,
      );

      expect(toolContext.projectContext!.content).toBe("");
      expect(result).toStrictEqual({ content: "" });
      expect(outlet).toHaveBeenCalledWith(0, "update_project_context", "");
    });

    // A total replacement of a NON-EMPTY document now needs `force` — see the
    // clobber-guard block below.
    it.each([
      ["updates content when project context is present", "", false],
      ["overwrites existing content when forced", "old content", true],
    ])("%s", async (_, initialContent, force) => {
      if (initialContent) toolContext.projectContext!.content = initialContent;

      const result = await context(
        { action: "write", content: "new content", force },
        toolContext,
      );

      expect(toolContext.projectContext!.content).toBe("new content");
      expect(result).toStrictEqual({ content: "new content" });
      expect(outlet).toHaveBeenCalledWith(
        0,
        "update_project_context",
        "new content",
      );
    });

    it("writes content via outlet even when project context is missing", async () => {
      const result = await context({ action: "write", content: "fresh" }, {});

      expect(result).toStrictEqual({ content: "fresh" });
      expect(outlet).toHaveBeenCalledWith(0, "update_project_context", "fresh");
    });
  });

  // The unrecoverable failure mode for the user-owned layers: a write REPLACES
  // the document, so content that keeps none of it destroys everything the user
  // accumulated.
  describe("write action - clobber guard", () => {
    const EXISTING = ["# Notes", "- Genre: deep house.", "- Drop at bar 33."]
      .join("\n")
      .concat("\n");

    it("skips the write and warns when the new content keeps none of the document", async () => {
      const warnSpy = vi.spyOn(v8Console, "warn");

      toolContext.projectContext!.content = EXISTING;

      const result = await context(
        { action: "write", content: "- Key: A minor." },
        toolContext,
      );

      // No-op: the document stands, and the result hands the model exactly what
      // it needs to re-send a merged write.
      expect(toolContext.projectContext!.content).toBe(EXISTING);
      expect(result).toStrictEqual({ content: EXISTING });
      // outlet 1 DOES fire — that's how console.warn reaches the LLM. Only the
      // project-context update on outlet 0 must not.
      expect(outlet).not.toHaveBeenCalledWith(
        0,
        "update_project_context",
        expect.anything(),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("scope:project write SKIPPED"),
      );
      // Names the escape hatch, since the skills deliberately don't.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("force:true"),
      );

      warnSpy.mockRestore();
    });

    it("writes when force is true", async () => {
      toolContext.projectContext!.content = EXISTING;

      const result = await context(
        { action: "write", content: "- Key: A minor.", force: true },
        toolContext,
      );

      expect(toolContext.projectContext!.content).toBe("- Key: A minor.");
      expect(result).toStrictEqual({ content: "- Key: A minor." });
      expect(outlet).toHaveBeenCalledWith(
        0,
        "update_project_context",
        "- Key: A minor.",
      );
    });

    it("is inert when the document is empty (nothing to destroy)", async () => {
      const result = await context(
        { action: "write", content: "- Key: A minor." },
        toolContext,
      );

      expect(result).toStrictEqual({ content: "- Key: A minor." });
      expect(outlet).toHaveBeenCalledWith(
        0,
        "update_project_context",
        "- Key: A minor.",
      );
    });

    it("allows the normal append case (one existing line survives verbatim)", async () => {
      toolContext.projectContext!.content = EXISTING;
      const merged = `${EXISTING}- Key: A minor.`;

      const result = await context(
        { action: "write", content: merged },
        toolContext,
      );

      expect(result).toStrictEqual({ content: merged });
      expect(outlet).toHaveBeenCalledWith(0, "update_project_context", merged);
    });

    it("allows a restructuring rewrite that drops only headings", async () => {
      toolContext.projectContext!.content = EXISTING;
      const rewritten =
        "## Track notes\n- Genre: deep house.\n- Drop at bar 33.";

      const result = await context(
        { action: "write", content: rewritten },
        toolContext,
      );

      expect(result).toStrictEqual({ content: rewritten });
      expect(outlet).toHaveBeenCalledWith(
        0,
        "update_project_context",
        rewritten,
      );
    });

    // Both sides are normalized before the containment test, so an ordinary
    // reformat still counts as surviving — without it, this guard would fire on
    // the everyday rewrite and teach models to reach for force.
    it.each([
      ["prose re-bulleted", "- Genre: deep house.\n- Drop at bar 33."],
      ["re-indented", "  Genre: deep house.\n\t- Drop at bar 33."],
      ["trailing punctuation added", "Genre: deep house!\n- Drop at bar 33."],
      ["numbered instead of dashed", "1. Genre: deep house\n2. Drop at bar 33"],
    ])(
      "allows a reformat that keeps the content (%s)",
      async (_, rewritten) => {
        toolContext.projectContext!.content =
          "Genre: deep house.\nDrop at bar 33.";

        const result = await context(
          { action: "write", content: rewritten },
          toolContext,
        );

        expect(result).toStrictEqual({ content: rewritten });
        expect(outlet).toHaveBeenCalledWith(
          0,
          "update_project_context",
          rewritten,
        );
      },
    );

    // Structural boilerplate must not vouch for a write: it appears in almost
    // any markdown, so a document containing one would otherwise be unguarded.
    it("still fires when only a horizontal rule survives", async () => {
      const warnSpy = vi.spyOn(v8Console, "warn");
      const existing = "---\n\nGenre: deep house.\nDrop at bar 33.";

      toolContext.projectContext!.content = existing;

      const result = await context(
        { action: "write", content: "---\n\nKey: A minor." },
        toolContext,
      );

      expect(result).toStrictEqual({ content: existing });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("scope:project write SKIPPED"),
      );

      warnSpy.mockRestore();
    });

    // Nothing distinctive enough to test containment on — the guard has no
    // opinion rather than blocking every write to such a document.
    it("stays out of the way when no line is substantive", async () => {
      toolContext.projectContext!.content = "---\n- 124\n- A min";

      const result = await context(
        { action: "write", content: "- Key: A minor." },
        toolContext,
      );

      expect(result).toStrictEqual({ content: "- Key: A minor." });
      expect(outlet).toHaveBeenCalledWith(
        0,
        "update_project_context",
        "- Key: A minor.",
      );
    });

    it("still allows an empty write to clear a non-empty document", async () => {
      toolContext.projectContext!.content = EXISTING;

      const result = await context(
        { action: "write", content: "" },
        toolContext,
      );

      expect(result).toStrictEqual({ content: "" });
      expect(outlet).toHaveBeenCalledWith(0, "update_project_context", "");
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

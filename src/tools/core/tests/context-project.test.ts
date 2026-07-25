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

  /**
   * Write `content` and assert the guard let it through: echoed back verbatim
   * and pushed out the project-context outlet.
   * @param content - The document body to write
   */
  async function expectWriteAllowed(content: string): Promise<void> {
    const result = await context({ action: "write", content }, toolContext);

    expect(result).toStrictEqual({ content });
    expect(outlet).toHaveBeenCalledWith(0, "update_project_context", content);
  }

  /**
   * Write `incoming` over `existing` and assert the clobber guard skipped it:
   * the document stands and the warning is relayed to the model.
   * @param existing - The document as it stands
   * @param incoming - The content the write attempts
   */
  async function expectWriteSkipped(
    existing: string,
    incoming: string,
  ): Promise<void> {
    const warnSpy = vi.spyOn(v8Console, "warn");

    toolContext.projectContext!.content = existing;

    const result = await context(
      { action: "write", content: incoming },
      toolContext,
    );

    expect(result).toStrictEqual({ content: existing });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("scope:project write SKIPPED"),
    );

    warnSpy.mockRestore();
  }

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
    const TABLE = "| a | b |\n| --- | --- |\n| Genre | deep house |";

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
      await expectWriteAllowed("- Key: A minor.");
    });

    it("allows the normal append case (one existing line survives verbatim)", async () => {
      toolContext.projectContext!.content = EXISTING;
      const merged = `${EXISTING}- Key: A minor.`;

      await expectWriteAllowed(merged);
    });

    it("allows a restructuring rewrite that drops only headings", async () => {
      toolContext.projectContext!.content = EXISTING;
      const rewritten =
        "## Track notes\n- Genre: deep house.\n- Drop at bar 33.";

      await expectWriteAllowed(rewritten);
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

        await expectWriteAllowed(rewritten);
      },
    );

    // Structural boilerplate must not vouch for a write: it appears in almost
    // any markdown, so a document containing one would otherwise be unguarded.
    it("still fires when only a horizontal rule survives", async () => {
      await expectWriteSkipped(
        "---\n\nGenre: deep house.\nDrop at bar 33.",
        "---\n\nKey: A minor.",
      );
    });

    // The floor counts alphanumerics, not non-whitespace: a table separator is
    // 9 non-whitespace characters but zero letters or digits, so reusing the
    // same column count must not vouch for replacing the rows around it.
    it("still fires when only a table separator row survives", async () => {
      await expectWriteSkipped(
        TABLE,
        "| x | y |\n| --- | --- |\n| Key | A minor |",
      );
    });

    // The content row is the other half of that rule: it really is surviving
    // content, so keeping it must still read as an edit.
    it("allows a table rewrite that keeps a content row", async () => {
      toolContext.projectContext!.content = TABLE;

      await expectWriteAllowed(`${TABLE}\n| Key | A minor |`);
    });

    // Nothing distinctive enough to test containment on — the guard has no
    // opinion rather than blocking every write to such a document.
    it("stays out of the way when no line is substantive", async () => {
      toolContext.projectContext!.content = "---\n- 124\n- A min";

      await expectWriteAllowed("- Key: A minor.");
    });

    it("still allows an empty write to clear a non-empty document", async () => {
      toolContext.projectContext!.content = EXISTING;

      await expectWriteAllowed("");
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

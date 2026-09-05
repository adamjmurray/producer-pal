// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as v8Console from "#src/shared/max/v8-max-console.ts";
import {
  beginWarningCapture,
  capturedWarnings,
  endWarningCapture,
  recordWarning,
  resetWarningCapture,
  suspendWarningCapture,
} from "#src/shared/max/v8-warning-capture.ts";
import { context } from "../context.ts";

vi.mock(import("#src/live-api-adapter/project-context-sync.ts"), () => ({
  backupProjectContextOnEdit: vi.fn(),
  syncProjectContextBackup: vi.fn(),
  resetProjectContextSyncMemo: vi.fn(),
}));

const { backupProjectContextOnEdit } =
  await import("#src/live-api-adapter/project-context-sync.ts");
const mockBackup = vi.mocked(backupProjectContextOnEdit);

describe("context - project scope (default)", () => {
  let toolContext: Partial<ToolContext>;

  beforeEach(() => {
    mockBackup.mockReset();
    resetWarningCapture();
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
      expect(capturedWarnings()).toHaveLength(0);
    });

    it("returns empty string when project context is missing", async () => {
      const result = await context({ action: "read" }, {});

      expect(result).toStrictEqual({ content: "" });
      expect(outlet).not.toHaveBeenCalled();
      expect(capturedWarnings()).toHaveLength(0);
    });
  });

  describe("write action", () => {
    it("throws error when content is missing", async () => {
      await expect(context({ action: "write" }, toolContext)).rejects.toThrow(
        "Content required for write action",
      );
      expect(outlet).not.toHaveBeenCalled();
      expect(capturedWarnings()).toHaveLength(0);
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

  // The outlet above updates the device UI silently (the patch routes it through
  // `prepend set`), so a tool write never re-enters V8's projectContext() setter
  // the way a device-UI or webui edit does. Nothing else would back it up: a
  // later tool call's sync is not a write, so it may not overwrite a differing
  // sidecar, and a write that is the session's last tool call would never reach
  // disk at all.
  describe("write action - on-disk backup", () => {
    it("backs up the sidecar immediately, without waiting for another tool call", async () => {
      await context({ action: "write", content: "Genre: jungle" }, toolContext);

      expect(mockBackup).toHaveBeenCalledExactlyOnceWith("Genre: jungle");
    });

    it("propagates a clear, so the sidecar is deleted rather than resurrected", async () => {
      toolContext.projectContext!.content = "existing content";

      await context({ action: "write", content: "" }, toolContext);

      expect(mockBackup).toHaveBeenCalledExactlyOnceWith("");
    });

    it("does not back up a write the clobber guard skipped", async () => {
      toolContext.projectContext!.content = "a long-accumulated document";

      await context({ action: "write", content: "hi" }, toolContext);

      expect(mockBackup).not.toHaveBeenCalled();
    });

    // Fire-and-forget from inside a tool call, so it starts detached: holding
    // the request's capture, its first suspend would pocket that capture and
    // reinstate it whenever the write resumes — over whatever request is
    // running by then. See v8-warning-capture.ts rule 3.
    it("starts the backup with the request's warning capture detached", async () => {
      const request = beginWarningCapture();
      let takenByTheBackup = true;

      mockBackup.mockImplementation(async () => {
        takenByTheBackup = recordWarning("from the backup");

        await suspendWarningCapture(Promise.resolve());
      });

      await context({ action: "write", content: "Genre: jungle" }, toolContext);

      expect(takenByTheBackup).toBe(false);
      expect(endWarningCapture(request)).toStrictEqual([]);
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
      // The warning still reaches the model on the response. Only the
      // project-context update on outlet 0 must not fire.
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

    // Headings vouch only when there is nothing else to vouch. A document that
    // is all headings used to fall through the guard entirely.
    describe("headings-only document", () => {
      const HEADINGS = "# Genres\n# Artists\n# Reference tracks";

      it("guards a document that is nothing but headings", async () => {
        await expectWriteSkipped(HEADINGS, "# Something else entirely");
      });

      it("allows a write that keeps one of the headings", async () => {
        toolContext.projectContext!.content = HEADINGS;

        await expectWriteAllowed(`${HEADINGS}\n- Genre: deep house.`);
      });

      it("stays inert when the headings carry no letters or digits", async () => {
        toolContext.projectContext!.content = "#\n##";

        await expectWriteAllowed("- Key: A minor.");
      });

      // Headings over a body of pure structure: the body exists but can vouch
      // for nothing, so holding the headings out left this unguarded on the
      // strength of its `---` and an unrelated write destroyed the heading
      // silently.
      it("guards headings whose only body is structure", async () => {
        await expectWriteSkipped("# Song Ideas\n---", "- Key: A minor.");
      });

      it("allows a write that keeps a heading over structure", async () => {
        toolContext.projectContext!.content = "# Song Ideas\n---";

        await expectWriteAllowed("# Song Ideas\n\n- Key: A minor.");
      });
    });

    // The reason headings are held out while a body exists: keeping the shell
    // and dropping everything under it is the clobber, not an edit.
    it("still guards a write that keeps only the heading", async () => {
      await expectWriteSkipped(EXISTING, "# Notes\n- Key: A minor.");
    });

    // Both sides are normalized before the containment test, so an ordinary
    // reformat still counts as surviving — without it, this guard would fire on
    // the everyday rewrite and teach models to reach for force.
    it.each([
      ["prose re-bulleted", "- Genre: deep house.\n- Drop at bar 33."],
      ["re-indented", "  Genre: deep house.\n\t- Drop at bar 33."],
      ["trailing punctuation added", "Genre: deep house!\n- Drop at bar 33."],
      ["numbered instead of dashed", "1. Genre: deep house\n2. Drop at bar 33"],
      ["re-cased", "GENRE: Deep House.\nDROP at bar 33."],
      ["emphasis added", "Genre: **deep house**.\nDrop at **bar 33**."],
    ])(
      "allows a reformat that keeps the content (%s)",
      async (_, rewritten) => {
        toolContext.projectContext!.content =
          "Genre: deep house.\nDrop at bar 33.";

        await expectWriteAllowed(rewritten);
      },
    );

    // The other direction: the needle carries the markup and the write drops it.
    // Both sides are normalized, so stripping emphasis off the whole document is
    // still an edit — it used to read as keeping none of it.
    it("allows a rewrite that strips the document's emphasis", async () => {
      toolContext.projectContext!.content =
        "- **Genre**: deep house.\n- _Drop at bar 33._";

      await expectWriteAllowed("- Genre: deep house.\n- Drop at bar 33.");
    });

    // Where that tolerance ends: normalization forgives a line's markup, not a
    // restructuring that splits one line across several. Every fact below
    // survives but no whole line does, so the guard fires — conservative by
    // design, and the model recovers by re-sending a merged write. Pinned so a
    // change to normalizeForContainment can't move this boundary unnoticed.
    it("fires when a reformat splits one line into several", async () => {
      await expectWriteSkipped(
        "Working title: Nightshade. Deep house, 124 BPM.",
        [
          "- Working title: Nightshade",
          "- Genre: deep house, 124 BPM",
          "- Key: A minor",
        ].join("\n"),
      );
    });

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

    // The floor decides WHICH line vouches, not whether the document is worth
    // guarding — applied unconditionally it measures a document by its LONGEST
    // LINE, which is the wrong measure. This roster is a lot of accumulated
    // context with nothing over 7 alphanumerics on any line, so an
    // unconditional floor would leave it entirely unguarded while a single
    // sentence of prose is fully covered.
    const SHORTHAND = [
      "- 124",
      "- A min",
      "- kick: t0",
      "- bass: t1",
      "- drop: b33",
      "- out: b65",
    ].join("\n");

    it("fires when a shorthand roster would be discarded whole", async () => {
      await expectWriteSkipped(SHORTHAND, "- Genre: melodic techno.");
    });

    it("allows a shorthand roster's write that keeps its lines", async () => {
      toolContext.projectContext!.content = SHORTHAND;

      await expectWriteAllowed(`${SHORTHAND}\n- Genre: melodic techno.`);
    });

    // The fallback tier's known weakness, recorded rather than endorsed: short
    // needles match by coincidence, so this write discards the whole roster and
    // still passes, on "A min" landing inside "A minor". The tier catches the
    // blatant clobber and misses the accidental one — don't lean on it the way
    // the substantive tier can be leaned on.
    it("misses a clobber that coincidentally contains a short line", async () => {
      toolContext.projectContext!.content = SHORTHAND;

      await expectWriteAllowed("- Genre: melodic techno in A minor.");
    });

    // Where the fallback stops: no letters or digits anywhere means nothing to
    // test containment on, so the guard has no opinion rather than blocking
    // every write to such a document.
    it("stays out of the way when the document is pure structure", async () => {
      toolContext.projectContext!.content = "---\n***";

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
    expect(capturedWarnings()).toHaveLength(0);
  });
});

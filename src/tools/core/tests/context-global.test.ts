// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { context } from "../context.ts";
import {
  beginWarningCapture,
  capturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const protocolMock =
  await import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts");

describe("context - global scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("read action", () => {
    it("round-trips to the globalContext.read node route", async () => {
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: true,
        result: { content: "global facts" },
      });

      const result = await context({ action: "read", scope: "global" });

      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "globalContext.read",
        {},
      );
      expect(result).toStrictEqual({ content: "global facts" });
      // The project outlet path must not fire for a global read.
      expect(capturedWarnings()).toHaveLength(0);
    });

    it("throws when the node route reports failure", async () => {
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: false,
        error: "disk on fire",
      });

      await expect(
        context({ action: "read", scope: "global" }),
      ).rejects.toThrow("disk on fire");
    });
  });

  describe("write action", () => {
    it("round-trips to the globalContext.write node route and echoes stored content", async () => {
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: true,
        result: { content: "new global facts" },
      });

      const result = await context({
        action: "write",
        scope: "global",
        content: "new global facts",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "globalContext.write",
        { content: "new global facts" },
      );
      expect(result).toStrictEqual({ content: "new global facts" });
      // Global writes go over the RPC bridge, not the project update_project_context outlet.
      expect(capturedWarnings()).toHaveLength(0);
    });

    it("allows an empty write to clear the file (matches the webui editor)", async () => {
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: true,
        result: { content: "" },
      });

      const result = await context({
        action: "write",
        scope: "global",
        content: "",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "globalContext.write",
        { content: "" },
      );
      expect(result).toStrictEqual({ content: "" });
    });

    it("rejects a write with no content before touching the node route", async () => {
      await expect(
        context({ action: "write", scope: "global" }),
      ).rejects.toThrow("Content required for write action");
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });

    it("throws when the node route reports failure", async () => {
      // The clobber guard reads the current document first, so the write's
      // failure is the SECOND response here.
      vi.mocked(protocolMock.requestNode)
        .mockResolvedValueOnce({ success: true, result: { content: "" } })
        .mockResolvedValue({ success: false, error: "permission denied" });

      await expect(
        context({ action: "write", scope: "global", content: "x" }),
      ).rejects.toThrow("permission denied");
    });
  });

  // Same guard as the project scope (see context-project.test.ts); here the
  // baseline comes from a globalContext.read round-trip rather than the
  // in-memory blob.
  describe("write action - clobber guard", () => {
    const EXISTING = "# How I work\n\n- Call me Adam.\n- Stock devices only.";

    /**
     * Answer globalContext.read with EXISTING and echo whatever a write
     * stores. With `keep`, a write also replaces what a later read answers.
     * @param keep - Whether writes change the stored document
     * @returns Nothing; installs the mock implementation
     */
    function mockGlobalStore(keep = false): void {
      let stored = EXISTING;

      vi.mocked(protocolMock.requestNode).mockImplementation(
        async (route: string, args?: object) => {
          if (route === "globalContext.read") {
            return { success: true, result: { content: stored } };
          }

          const { content } = args as { content: string };

          if (keep) {
            stored = content;
          }

          return { success: true, result: { content } };
        },
      );
    }

    it("refuses the write when the new content keeps none of the document", async () => {
      mockGlobalStore();

      await expect(
        context({
          action: "write",
          scope: "global",
          content: "- Prefers 90 BPM.",
        }),
      ).rejects.toThrow(/write refused for scope "global".*force:true/);

      expect(protocolMock.requestNode).not.toHaveBeenCalledWith(
        "globalContext.write",
        expect.anything(),
      );
    });

    const REPLACE = {
      action: "write",
      scope: "global",
      content: "- Prefers 90 BPM.",
    } as const;
    const UNEARNED_FORCE =
      /^force:true ignored — nothing had warned about this yet\. write refused for scope "global"/;

    it("writes on force after a refusal, and clears the record", async () => {
      mockGlobalStore();

      await expect(context(REPLACE)).rejects.toThrow(/^write refused/);
      beginWarningCapture();

      const result = await context({ ...REPLACE, force: true });

      expect(result).toStrictEqual({ content: "- Prefers 90 BPM." });
      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "globalContext.write",
        { content: "- Prefers 90 BPM." },
      );

      // The record is spent: a second force is unearned.
      await expect(context({ ...REPLACE, force: true })).rejects.toThrow(
        UNEARNED_FORCE,
      );
    });

    it("does not let a refusal unlock force once the document has changed", async () => {
      mockGlobalStore(true);
      const merged = `${EXISTING}\n- Likes sidechain.`;

      await expect(context(REPLACE)).rejects.toThrow(/^write refused/);
      beginWarningCapture();
      await context({ ...REPLACE, content: merged });
      beginWarningCapture();

      await expect(context({ ...REPLACE, force: true })).rejects.toThrow(
        UNEARNED_FORCE,
      );
      expect(protocolMock.requestNode).not.toHaveBeenCalledWith(
        "globalContext.write",
        { content: REPLACE.content },
      );
    });

    it("does not unlock force in the request that refused", async () => {
      mockGlobalStore();

      await expect(context(REPLACE)).rejects.toThrow(/^write refused/);
      await expect(context({ ...REPLACE, force: true })).rejects.toThrow(
        UNEARNED_FORCE,
      );
    });

    it("refuses force before any refusal, with a note, and records the scope", async () => {
      mockGlobalStore();

      await expect(context({ ...REPLACE, force: true })).rejects.toThrow(
        UNEARNED_FORCE,
      );
      expect(protocolMock.requestNode).not.toHaveBeenCalledWith(
        "globalContext.write",
        expect.anything(),
      );

      // That refusal warned, so force in the next request goes ahead.
      beginWarningCapture();
      await expect(context({ ...REPLACE, force: true })).resolves.toStrictEqual(
        { content: "- Prefers 90 BPM." },
      );
    });

    it("lets force write where the guard would not fire, and records nothing", async () => {
      mockGlobalStore();
      const merged = `${EXISTING}\n- Prefers 90 BPM.`;

      await expect(
        context({ ...REPLACE, content: merged, force: true }),
      ).resolves.toStrictEqual({ content: merged });

      // It left no record behind.
      await expect(context({ ...REPLACE, force: true })).rejects.toThrow(
        UNEARNED_FORCE,
      );
    });

    it("allows the normal append case", async () => {
      mockGlobalStore();
      const merged = `${EXISTING}\n- Prefers 90 BPM.`;

      const result = await context({
        action: "write",
        scope: "global",
        content: merged,
      });

      expect(result).toStrictEqual({ content: merged });
      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "globalContext.write",
        { content: merged },
      );
    });
  });

  it("throws for an unknown action under the global scope", async () => {
    await expect(context({ action: "nope", scope: "global" })).rejects.toThrow(
      "Unknown action for scope:global: nope",
    );
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it("refuses delete under the global scope, saying delete is memory-only", async () => {
    await expect(
      context({ action: "delete", scope: "global" }),
    ).rejects.toThrow('action "delete" is only for scope "memory"');
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });
});

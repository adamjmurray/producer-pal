// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as v8Console from "#src/shared/max/v8-max-console.ts";
import { context } from "../context.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");

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
      ).rejects.toThrow("globalContext.read failed: disk on fire");
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
      ).rejects.toThrow("globalContext.write failed: permission denied");
    });
  });

  // Same guard as the project scope (see context-project.test.ts); here the
  // baseline comes from a globalContext.read round-trip rather than the
  // in-memory blob.
  describe("write action - clobber guard", () => {
    const EXISTING = "# How I work\n\n- Call me Adam.\n- Stock devices only.";

    /**
     * Answer globalContext.read with EXISTING and echo whatever a write stores.
     * @returns Nothing; installs the mock implementation
     */
    function mockGlobalStore(): void {
      vi.mocked(protocolMock.requestNode).mockImplementation(
        async (route: string, args?: object) =>
          route === "globalContext.read"
            ? { success: true, result: { content: EXISTING } }
            : {
                success: true,
                result: { content: (args as { content: string }).content },
              },
      );
    }

    it("skips the write and warns when the new content keeps none of the document", async () => {
      const warnSpy = vi.spyOn(v8Console, "warn");

      mockGlobalStore();

      const result = await context({
        action: "write",
        scope: "global",
        content: "- Prefers 90 BPM.",
      });

      expect(result).toStrictEqual({ content: EXISTING });
      expect(protocolMock.requestNode).not.toHaveBeenCalledWith(
        "globalContext.write",
        expect.anything(),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("scope:global write SKIPPED"),
      );

      warnSpy.mockRestore();
    });

    it("writes when force is true, without reading first", async () => {
      mockGlobalStore();

      const result = await context({
        action: "write",
        scope: "global",
        content: "- Prefers 90 BPM.",
        force: true,
      });

      expect(result).toStrictEqual({ content: "- Prefers 90 BPM." });
      expect(protocolMock.requestNode).toHaveBeenCalledExactlyOnceWith(
        "globalContext.write",
        { content: "- Prefers 90 BPM." },
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

  it("rejects delete under the global scope (delete lives under scope:memory)", async () => {
    await expect(
      context({ action: "delete", scope: "global", name: "x" }),
    ).rejects.toThrow("Unknown action for scope:global: delete");
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });
});

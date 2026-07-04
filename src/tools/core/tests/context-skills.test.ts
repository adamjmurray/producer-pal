// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { context } from "../context.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");

describe("context - skills scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Make requestNode resolve with a content payload.
   * @param content - The content string the route should return
   */
  function mockNodeContent(content: string): void {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { content },
    });
  }

  describe("read action", () => {
    it("reads one skill by name over the skills.read route", async () => {
      mockNodeContent("the instructions");

      const result = await context({
        action: "read",
        scope: "skills",
        name: "jazz-voicings",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("skills.read", {
        name: "jazz-voicings",
      });
      expect(result).toStrictEqual({ content: "the instructions" });
      // The project outlet path must not fire for a skills read.
      expect(outlet).not.toHaveBeenCalled();
    });

    it("rejects a read with no name before touching the node route", async () => {
      await expect(
        context({ action: "read", scope: "skills" }),
      ).rejects.toThrow("name required to read a skill");
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });

    it("throws when the node route reports failure", async () => {
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: false,
        error: "disk on fire",
      });

      await expect(
        context({ action: "read", scope: "skills", name: "x" }),
      ).rejects.toThrow("skills.read failed: disk on fire");
    });
  });

  describe("remember action", () => {
    it("saves a skill, defaulting a missing description to ''", async () => {
      mockNodeContent("index");

      await context({
        action: "remember",
        scope: "skills",
        name: "Jazz Voicings",
        content: "Voice with 3rds and 7ths.",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("skills.remember", {
        name: "Jazz Voicings",
        description: "",
        content: "Voice with 3rds and 7ths.",
      });
    });

    it("passes the description through when provided", async () => {
      mockNodeContent("index");

      await context({
        action: "remember",
        scope: "skills",
        name: "jazz-voicings",
        description: "rich voicings",
        content: "Voice with 3rds and 7ths.",
      });

      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "skills.remember",
        expect.objectContaining({ description: "rich voicings" }),
      );
    });

    it.each([
      [{ content: "b" }, "name required for remember action"],
      [{ name: "x" }, "content required for remember action"],
    ])(
      "rejects an incomplete remember before touching the node route",
      async (extra, message) => {
        await expect(
          context({ action: "remember", scope: "skills", ...extra }),
        ).rejects.toThrow(message);
        expect(protocolMock.requestNode).not.toHaveBeenCalled();
      },
    );
  });

  describe("forget action", () => {
    it("deletes a skill by name", async () => {
      mockNodeContent("index");

      await context({ action: "forget", scope: "skills", name: "stale" });

      expect(protocolMock.requestNode).toHaveBeenCalledWith("skills.forget", {
        name: "stale",
      });
    });

    it("rejects a forget with no name", async () => {
      await expect(
        context({ action: "forget", scope: "skills" }),
      ).rejects.toThrow("name required for forget action");
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });
  });

  it("lists the skills index", async () => {
    mockNodeContent("# Producer Pal Custom Skills");

    const result = await context({ action: "list", scope: "skills" });

    expect(protocolMock.requestNode).toHaveBeenCalledWith("skills.list", {});
    expect(result).toStrictEqual({ content: "# Producer Pal Custom Skills" });
  });

  it("throws for an unknown action under the skills scope", async () => {
    await expect(
      context({ action: "write", scope: "skills", content: "x" }),
    ).rejects.toThrow("Unknown action for scope:skills: write");
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });
});

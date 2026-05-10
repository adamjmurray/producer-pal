// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockFolderStructure } from "#src/test/mocks/mock-folder.ts";
import { type SamplesResult } from "../context-helpers.ts";
import { context } from "../context.ts";
import {
  mockKickSnareFolder,
  mockKickSnareKick808Folder,
  mockKickWithDrumsSubfolder,
} from "./samples-test-helpers.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn().mockResolvedValue({
    success: true,
    result: { source: "live-db", dbAvailable: false, samples: [] },
  }),
  handleNodeResponse: vi.fn(),
}));

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");

describe("context - search action", () => {
  let toolContext: { sampleFolder: string | null };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { source: "live-db", dbAvailable: false, samples: [] },
    });
    toolContext = {
      sampleFolder: null,
    };
  });

  describe("error handling", () => {
    it("throws error when sampleFolder is not configured", async () => {
      await expect(context({ action: "search" }, toolContext)).rejects.toThrow(
        "A sample folder must first be selected in the Setup tab of the Producer Pal Max for Live device",
      );
    });

    it("throws error when sampleFolder is empty string", async () => {
      toolContext.sampleFolder = "";
      await expect(context({ action: "search" }, toolContext)).rejects.toThrow(
        "A sample folder must first be selected",
      );
    });
  });

  describe("basic functionality", () => {
    it("returns empty samples array for empty folder", async () => {
      toolContext.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [],
      });

      const result = (await context(
        { action: "search" },
        toolContext,
      )) as SamplesResult;

      expect(result.sampleFolder).toBe("/samples/");
      expect(result.samples).toStrictEqual([]);
    });

    it("returns audio files with relative paths", async () => {
      toolContext.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "snare.mp3", type: "file", extension: ".mp3" },
        ],
      });

      const result = (await context(
        { action: "search" },
        toolContext,
      )) as SamplesResult;

      expect(result.sampleFolder).toBe("/samples/");
      expect(result.samples).toStrictEqual(["kick.wav", "snare.mp3"]);
    });

    it("filters non-audio files", async () => {
      toolContext.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "readme.txt", type: "file", extension: ".txt" },
          { name: "snare.aiff", type: "file", extension: ".aiff" },
        ],
      });

      const result = (await context(
        { action: "search" },
        toolContext,
      )) as SamplesResult;

      expect(result.samples).toStrictEqual(["kick.wav", "snare.aiff"]);
    });
  });

  describe("search filtering", () => {
    it("returns all samples when search is not provided", async () => {
      toolContext.sampleFolder = "/samples/";
      mockKickSnareFolder();

      const result = (await context(
        { action: "search" },
        toolContext,
      )) as SamplesResult;

      expect(result.samples).toStrictEqual(["kick.wav", "snare.wav"]);
    });

    it("filters samples by case-insensitive substring match", async () => {
      toolContext.sampleFolder = "/samples/";
      mockKickSnareKick808Folder();

      const result = (await context(
        { action: "search", search: "kick" },
        toolContext,
      )) as SamplesResult;

      expect(result.samples).toStrictEqual(["kick.wav", "Kick_808.wav"]);
    });

    it("filters by folder path when searching", async () => {
      toolContext.sampleFolder = "/samples/";
      mockKickWithDrumsSubfolder();

      const result = (await context(
        { action: "search", search: "drums" },
        toolContext,
      )) as SamplesResult;

      expect(result.samples).toStrictEqual([
        "drums/snare.wav",
        "drums/hihat.wav",
      ]);
    });

    it("returns empty array when no matches found", async () => {
      toolContext.sampleFolder = "/samples/";
      mockKickSnareFolder();

      const result = (await context(
        { action: "search", search: "cymbal" },
        toolContext,
      )) as SamplesResult;

      expect(result.samples).toStrictEqual([]);
    });
  });

  describe("library DB integration", () => {
    it("merges DB samples and dedupes against folder scan", async () => {
      toolContext.sampleFolder = "/samples/";
      mockKickSnareFolder();
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: true,
        result: {
          source: "live-db",
          dbAvailable: true,
          samples: [
            // Duplicates folder's kick.wav by absolute path — should be filtered out
            { path: "/samples/kick.wav", name: "kick.wav", useCount: 10 },
            // Unique to DB — should be surfaced
            {
              path: "/Users/me/Music/Ableton/clap.wav",
              name: "clap.wav",
              useCount: 42,
            },
          ],
        },
      });

      const result = (await context(
        { action: "search" },
        toolContext,
      )) as SamplesResult;

      expect(result.libraryAvailable).toBe(true);
      expect(result.librarySamples).toHaveLength(1);
      expect(result.librarySamples?.[0]?.path).toBe(
        "/Users/me/Music/Ableton/clap.wav",
      );
    });

    it("falls back gracefully when library route returns failure", async () => {
      toolContext.sampleFolder = "/samples/";
      mockKickSnareFolder();
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: false,
        error: "Live database not found",
      });

      const result = (await context(
        { action: "search" },
        toolContext,
      )) as SamplesResult;

      expect(result.libraryAvailable).toBe(false);
      expect(result.librarySamples).toStrictEqual([]);
      expect(result.samples).toStrictEqual(["kick.wav", "snare.wav"]);
    });

    it("reports libraryAvailable false when DB is missing", async () => {
      toolContext.sampleFolder = "/samples/";
      mockKickSnareFolder();
      vi.mocked(protocolMock.requestNode).mockResolvedValue({
        success: true,
        result: {
          source: "live-db",
          dbAvailable: false,
          samples: [],
          reason: "Live database not found",
        },
      });

      const result = (await context(
        { action: "search" },
        toolContext,
      )) as SamplesResult;

      expect(result.libraryAvailable).toBe(false);
      expect(result.librarySamples).toStrictEqual([]);
    });
  });
});

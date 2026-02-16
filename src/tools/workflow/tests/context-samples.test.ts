// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { mockFolderStructure } from "#src/test/mocks/mock-folder.ts";
import { type SamplesResult } from "../context-helpers.ts";
import { context } from "../context.ts";

describe("context - search action", () => {
  let toolContext: { sampleFolder: string | null };

  beforeEach(() => {
    toolContext = {
      sampleFolder: null,
    };
  });

  describe("error handling", () => {
    it("throws error when sampleFolder is not configured", () => {
      expect(() => context({ action: "search" }, toolContext)).toThrow(
        "A sample folder must first be selected in the Setup tab of the Producer Pal Max for Live device",
      );
    });

    it("throws error when sampleFolder is empty string", () => {
      toolContext.sampleFolder = "";
      expect(() => context({ action: "search" }, toolContext)).toThrow(
        "A sample folder must first be selected",
      );
    });
  });

  describe("basic functionality", () => {
    it("returns empty samples array for empty folder", () => {
      toolContext.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [],
      });

      const result = context({ action: "search" }, toolContext);

      expect(result).toStrictEqual({
        sampleFolder: "/samples/",
        samples: [],
      });
    });

    it("returns audio files with relative paths", () => {
      toolContext.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "snare.mp3", type: "file", extension: ".mp3" },
        ],
      });

      const result = context(
        { action: "search" },
        toolContext,
      ) as SamplesResult;

      expect(result.sampleFolder).toBe("/samples/");
      expect(result.samples).toStrictEqual(["kick.wav", "snare.mp3"]);
    });

    it("filters non-audio files", () => {
      toolContext.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "readme.txt", type: "file", extension: ".txt" },
          { name: "snare.aiff", type: "file", extension: ".aiff" },
        ],
      });

      const result = context(
        { action: "search" },
        toolContext,
      ) as SamplesResult;

      expect(result.samples).toStrictEqual(["kick.wav", "snare.aiff"]);
    });
  });

  describe("search filtering", () => {
    it("returns all samples when search is not provided", () => {
      toolContext.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "snare.wav", type: "file", extension: ".wav" },
        ],
      });

      const result = context(
        { action: "search" },
        toolContext,
      ) as SamplesResult;

      expect(result.samples).toStrictEqual(["kick.wav", "snare.wav"]);
    });

    it("filters samples by case-insensitive substring match", () => {
      toolContext.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "snare.wav", type: "file", extension: ".wav" },
          { name: "Kick_808.wav", type: "file", extension: ".wav" },
        ],
      });

      const result = context(
        { action: "search", search: "kick" },
        toolContext,
      ) as SamplesResult;

      expect(result.samples).toStrictEqual(["kick.wav", "Kick_808.wav"]);
    });

    it("filters by folder path when searching", () => {
      toolContext.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "drums", type: "fold" },
        ],
        "/samples/drums/": [
          { name: "snare.wav", type: "file", extension: ".wav" },
          { name: "hihat.wav", type: "file", extension: ".wav" },
        ],
      });

      const result = context(
        { action: "search", search: "drums" },
        toolContext,
      ) as SamplesResult;

      expect(result.samples).toStrictEqual([
        "drums/snare.wav",
        "drums/hihat.wav",
      ]);
    });

    it("returns empty array when no matches found", () => {
      toolContext.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "snare.wav", type: "file", extension: ".wav" },
        ],
      });

      const result = context(
        { action: "search", search: "cymbal" },
        toolContext,
      ) as SamplesResult;

      expect(result.samples).toStrictEqual([]);
    });
  });
});

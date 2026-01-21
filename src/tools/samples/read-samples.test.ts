import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type FolderEntry,
  mockFolderStructure,
} from "#src/test/mocks/mock-folder.ts";
import { readSamples } from "./read-samples.ts";

describe("readSamples", () => {
  let context: { sampleFolder: string | null };

  beforeEach(() => {
    context = {
      sampleFolder: null,
    };
  });

  describe("error handling", () => {
    it("should throw error when sampleFolder is not configured", () => {
      expect(() => readSamples({}, context)).toThrow(
        "A sample folder must first be selected in the Setup tab of the Producer Pal Max for Live device",
      );
    });

    it("should throw error when sampleFolder is empty string", () => {
      context.sampleFolder = "";
      expect(() => readSamples({}, context)).toThrow(
        "A sample folder must first be selected",
      );
    });
  });

  describe("basic functionality", () => {
    it("should return empty samples array for empty folder", () => {
      context.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [],
      });

      const result = readSamples({}, context);

      expect(result).toStrictEqual({
        sampleFolder: "/samples/",
        samples: [],
      });
    });

    it("should return audio files with relative paths", () => {
      context.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "snare.mp3", type: "file", extension: ".mp3" },
        ],
      });

      const result = readSamples({}, context);

      expect(result.sampleFolder).toBe("/samples/");
      expect(result.samples).toStrictEqual(["kick.wav", "snare.mp3"]);
    });

    it("should normalize sampleFolder to end with /", () => {
      context.sampleFolder = "/samples";
      mockFolderStructure({
        "/samples/": [{ name: "kick.wav", type: "file", extension: ".wav" }],
      });

      const result = readSamples({}, context);

      expect(result.sampleFolder).toBe("/samples/");
    });
  });

  describe("file filtering", () => {
    it("should filter non-audio files", () => {
      context.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "readme.txt", type: "file", extension: ".txt" },
          { name: "project.als", type: "file", extension: ".als" },
          { name: "snare.aiff", type: "file", extension: ".aiff" },
        ],
      });

      const result = readSamples({}, context);

      expect(result.samples).toStrictEqual(["kick.wav", "snare.aiff"]);
    });

    it("should support all audio extensions case-insensitively", () => {
      context.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "a.wav", type: "file", extension: ".wav" },
          { name: "b.WAV", type: "file", extension: ".WAV" },
          { name: "c.aiff", type: "file", extension: ".aiff" },
          { name: "d.aif", type: "file", extension: ".aif" },
          { name: "e.aifc", type: "file", extension: ".aifc" },
          { name: "f.flac", type: "file", extension: ".flac" },
          { name: "g.ogg", type: "file", extension: ".ogg" },
          { name: "h.mp3", type: "file", extension: ".mp3" },
          { name: "i.m4a", type: "file", extension: ".m4a" },
        ],
      });

      const result = readSamples({}, context);

      expect(result.samples).toHaveLength(9);
    });

    it("should skip files without extensions", () => {
      context.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "LICENSE", type: "file" }, // No extension property
          { name: "README", type: "file", extension: "" }, // Empty extension
          { name: "snare.mp3", type: "file", extension: ".mp3" },
        ],
      });

      const result = readSamples({}, context);

      expect(result.samples).toStrictEqual(["kick.wav", "snare.mp3"]);
    });
  });

  describe("nested directories", () => {
    it("should scan nested folders recursively", () => {
      context.sampleFolder = "/samples/";
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

      const result = readSamples({}, context);

      expect(result.samples).toStrictEqual([
        "kick.wav",
        "drums/snare.wav",
        "drums/hihat.wav",
      ]);
    });

    it("should handle deeply nested folders", () => {
      context.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [{ name: "drums", type: "fold" }],
        "/samples/drums/": [{ name: "acoustic", type: "fold" }],
        "/samples/drums/acoustic/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
        ],
      });

      const result = readSamples({}, context);

      expect(result.samples).toStrictEqual(["drums/acoustic/kick.wav"]);
    });
  });

  describe("limit handling", () => {
    it("should stop at MAX_SAMPLE_FILES limit", () => {
      context.sampleFolder = "/samples/";

      // Create 1005 files (more than the 1000 limit)
      const entries: FolderEntry[] = [];

      for (let i = 0; i < 1005; i++) {
        entries.push({
          name: `sample${i}.wav`,
          type: "file",
          extension: ".wav",
        });
      }

      mockFolderStructure({
        "/samples/": entries,
      });

      const result = readSamples({}, context);

      expect(result.samples).toHaveLength(1000);
    });

    it("should log warning when limit is reached", () => {
      context.sampleFolder = "/samples/";

      const entries: FolderEntry[] = [];

      for (let i = 0; i < 1005; i++) {
        entries.push({
          name: `sample${i}.wav`,
          type: "file",
          extension: ".wav",
        });
      }

      mockFolderStructure({
        "/samples/": entries,
      });

      // Mock console.error
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      readSamples({}, context);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Stopped scanning for samples at 1000 files. Consider using a smaller sample folder.",
      );

      consoleSpy.mockRestore();
    });

    it("should stop scanning nested folders when limit is reached", () => {
      context.sampleFolder = "/samples/";

      // Create 1000 files in root, plus a folder with more
      const rootEntries: FolderEntry[] = [];

      for (let i = 0; i < 999; i++) {
        rootEntries.push({
          name: `sample${i}.wav`,
          type: "file",
          extension: ".wav",
        });
      }

      rootEntries.push({ name: "more", type: "fold" });

      mockFolderStructure({
        "/samples/": rootEntries,
        "/samples/more/": [
          { name: "a.wav", type: "file", extension: ".wav" },
          { name: "b.wav", type: "file", extension: ".wav" },
          { name: "c.wav", type: "file", extension: ".wav" },
        ],
      });

      const result = readSamples({}, context);

      // Should have 999 root files + 1 from nested (hitting 1000 limit)
      expect(result.samples).toHaveLength(1000);
    });
  });

  describe("search filtering", () => {
    it("should return all samples when search is not provided", () => {
      context.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "snare.wav", type: "file", extension: ".wav" },
        ],
      });

      const result = readSamples({}, context);

      expect(result.samples).toStrictEqual(["kick.wav", "snare.wav"]);
    });

    it("should filter samples by case-insensitive substring match on filename", () => {
      context.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "snare.wav", type: "file", extension: ".wav" },
          { name: "Kick_808.wav", type: "file", extension: ".wav" },
          { name: "hihat.wav", type: "file", extension: ".wav" },
        ],
      });

      const result = readSamples({ search: "kick" }, context);

      expect(result.samples).toStrictEqual(["kick.wav", "Kick_808.wav"]);
    });

    it("should filter samples by case-insensitive substring match on folder path", () => {
      context.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "drums", type: "fold" },
          { name: "bass", type: "fold" },
        ],
        "/samples/drums/": [
          { name: "snare.wav", type: "file", extension: ".wav" },
          { name: "hihat.wav", type: "file", extension: ".wav" },
        ],
        "/samples/bass/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
        ],
      });

      const result = readSamples({ search: "drums" }, context);

      expect(result.samples).toStrictEqual([
        "drums/snare.wav",
        "drums/hihat.wav",
      ]);
    });

    it("should return empty array when no matches found", () => {
      context.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "kick.wav", type: "file", extension: ".wav" },
          { name: "snare.wav", type: "file", extension: ".wav" },
        ],
      });

      const result = readSamples({ search: "cymbal" }, context);

      expect(result.samples).toStrictEqual([]);
    });

    it("should handle search with mixed case", () => {
      context.sampleFolder = "/samples/";
      mockFolderStructure({
        "/samples/": [
          { name: "KICK.wav", type: "file", extension: ".wav" },
          { name: "Snare.wav", type: "file", extension: ".wav" },
          { name: "kick_808.WAV", type: "file", extension: ".WAV" },
        ],
      });

      const result = readSamples({ search: "KiCk" }, context);

      expect(result.samples).toStrictEqual(["KICK.wav", "kick_808.WAV"]);
    });

    it("should only count matching files toward MAX_SAMPLE_FILES limit", () => {
      context.sampleFolder = "/samples/";

      // Create 1005 non-matching files and 5 matching files
      const entries: FolderEntry[] = [];

      for (let i = 0; i < 1005; i++) {
        entries.push({
          name: `sample${i}.wav`,
          type: "file",
          extension: ".wav",
        });
      }

      // Add 5 files that match "kick"
      for (let i = 0; i < 5; i++) {
        entries.push({
          name: `kick${i}.wav`,
          type: "file",
          extension: ".wav",
        });
      }

      mockFolderStructure({
        "/samples/": entries,
      });

      const result = readSamples({ search: "kick" }, context);

      // Should return all 5 matching files, not limited by MAX_SAMPLE_FILES
      expect(result.samples).toHaveLength(5);
      expect(result.samples).toStrictEqual([
        "kick0.wav",
        "kick1.wav",
        "kick2.wav",
        "kick3.wav",
        "kick4.wav",
      ]);
    });
  });
});

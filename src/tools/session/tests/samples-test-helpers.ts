// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type FolderEntry,
  mockFolderStructure,
} from "#src/test/mocks/mock-folder.ts";

/**
 * Create an array of numbered wav file entries.
 * @param count - Number of entries to create
 * @param prefix - Filename prefix (default: "sample")
 * @returns Array of FolderEntry objects
 */
export function createWavEntries(
  count: number,
  prefix = "sample",
): FolderEntry[] {
  const entries: FolderEntry[] = [];

  for (let i = 0; i < count; i++) {
    entries.push({
      name: `${prefix}${i}.wav`,
      type: "file",
      extension: ".wav",
    });
  }

  return entries;
}

/**
 * Mock a folder with kick.wav and snare.wav audio files.
 */
export function mockKickSnareFolder(): void {
  mockFolderStructure({
    "/samples/": [
      { name: "kick.wav", type: "file", extension: ".wav" },
      { name: "snare.wav", type: "file", extension: ".wav" },
    ],
  });
}

/**
 * Mock a folder with kick.wav, snare.wav, and Kick_808.wav audio files.
 */
export function mockKickSnareKick808Folder(): void {
  mockFolderStructure({
    "/samples/": [
      { name: "kick.wav", type: "file", extension: ".wav" },
      { name: "snare.wav", type: "file", extension: ".wav" },
      { name: "Kick_808.wav", type: "file", extension: ".wav" },
    ],
  });
}

/**
 * Mock a folder with kick.wav at root and drums/ subfolder containing snare.wav and hihat.wav.
 */
export function mockKickWithDrumsSubfolder(): void {
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
}

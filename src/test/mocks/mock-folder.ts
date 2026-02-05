// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { vi } from "vitest";

export interface FolderEntry {
  name: string;
  type: "file" | "fold";
  extension?: string;
}

let mockFileSystem: Record<string, FolderEntry[]> = {};

/**
 * Configure the mock file system for Folder testing
 * @param structure - Object mapping directory paths to arrays of entries
 *
 * @example
 * mockFolderStructure({
 *   "/samples/": [
 *     { name: "kick.wav", type: "file", extension: ".wav" },
 *     { name: "snare.mp3", type: "file", extension: ".mp3" },
 *     { name: "loops", type: "fold" },
 *   ],
 *   "/samples/loops/": [
 *     { name: "beat.wav", type: "file", extension: ".wav" },
 *   ],
 * });
 */
export function mockFolderStructure(
  structure: Record<string, FolderEntry[]>,
): void {
  mockFileSystem = structure;
}

/**
 * Clear the mock file system
 */
export function clearMockFolderStructure(): void {
  mockFileSystem = {};
}

/**
 * Mock Folder class that simulates v8 Max Folder API
 */
export class Folder {
  private _path: string;
  private _entries: FolderEntry[];
  private _index: number;
  private _closed: boolean;

  constructor(path: string) {
    this._path = path;
    this._entries = mockFileSystem[path] ?? [];
    this._index = 0;
    this._closed = false;
  }

  get pathname(): string {
    return this._path;
  }

  get filename(): string {
    const entry = this._entries[this._index];

    return entry?.name ?? "";
  }

  get filetype(): string {
    const entry = this._entries[this._index];

    return entry?.type ?? "";
  }

  get extension(): string {
    const entry = this._entries[this._index];

    return entry?.extension ?? "";
  }

  get end(): boolean {
    return this._index >= this._entries.length;
  }

  next(): void {
    if (!this._closed && this._index < this._entries.length) {
      this._index++;
    }
  }

  close(): void {
    this._closed = true;
  }
}

// Spy versions for assertion testing
export const folderConstructor = vi.fn((path: string) => new Folder(path));

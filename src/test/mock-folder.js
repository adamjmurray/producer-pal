import { vi } from "vitest";

// Store mock file system structure
let mockFileSystem = {};

/**
 * Configure the mock file system for Folder testing
 * @param {object} structure - Object mapping directory paths to arrays of entries
 *   Each entry: { name: string, type: "file"|"fold", extension?: string }
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
export function mockFolderStructure(structure) {
  mockFileSystem = structure;
}

/**
 * Clear the mock file system
 */
export function clearMockFolderStructure() {
  mockFileSystem = {};
}

/**
 * Mock Folder class that simulates v8 Max Folder API
 */
export class Folder {
  constructor(path) {
    this._path = path;
    this._entries = mockFileSystem[path] ?? [];
    this._index = 0;
    this._closed = false;
  }

  get pathname() {
    return this._path;
  }

  get filename() {
    if (this._index >= this._entries.length) {
      return "";
    }
    return this._entries[this._index].name;
  }

  get filetype() {
    if (this._index >= this._entries.length) {
      return "";
    }
    return this._entries[this._index].type;
  }

  get extension() {
    if (this._index >= this._entries.length) {
      return "";
    }
    return this._entries[this._index].extension ?? "";
  }

  get end() {
    return this._index >= this._entries.length;
  }

  next() {
    if (!this._closed && this._index < this._entries.length) {
      this._index++;
    }
  }

  close() {
    this._closed = true;
  }
}

// Spy versions for assertion testing
export const folderConstructor = vi.fn((path) => new Folder(path));

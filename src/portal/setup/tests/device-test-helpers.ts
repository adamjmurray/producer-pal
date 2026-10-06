// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Bytes shaped like a frozen device: binary noise around the server source.
 *
 * @param version - Version to stamp in, or none for a file with no marker
 * @param tag - Extra text so two files with one version still differ
 * @returns The fake device's contents
 */
export function fakeDevice(version?: string, tag = ""): Buffer {
  const marker = version == null ? "" : `const VERSION = "${version}";`;

  return Buffer.from(`ampf\u0000\u0001${marker}\u0000${tag}`, "latin1");
}

/**
 * @returns A fresh, empty folder to use as a User Library
 */
export function makeScratchLibrary(): string {
  return mkdtempSync(join(tmpdir(), "ppal-device-"));
}

/**
 * Write a file, making its folders.
 *
 * @param file - Where to write
 * @param contents - File contents
 */
export function put(file: string, contents: Buffer | string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

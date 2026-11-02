// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What the status checks need to know about a device file. A device is ~10 MB
// and the chat UI polls the status every few seconds during a swap, so the
// facts are kept until the file changes.

import { createHash } from "node:crypto";
import {
  libraryFileStamp,
  readLibraryBytes,
} from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";
import { readDeviceVersion } from "./device-version.ts";

/** How many leading bytes tell a frozen device from an unfrozen one. */
const HEADER_BYTES = 64;

/** What is known about one device file's contents. */
export interface DeviceFileFacts {
  /** The first bytes, which show whether the device is frozen */
  header: Buffer;
  /** The version it names, when it names one */
  version?: string;
  /** Hash of the whole file: equal digests mean equal bytes */
  digest: string;
}

const cache = new Map<string, { stamp: string; facts: DeviceFileFacts }>();

/**
 * Read a device file, or recall what the last read found if its size, modified
 * time and inode haven't changed. A copy or rename into place changes at least
 * the inode, and this process's own installs forget the entry. Nothing is kept
 * for a file that can't be read.
 * @param path - A device file
 * @returns What its contents are
 * @throws Error when the file can't be read
 */
export function deviceFileFacts(path: string): DeviceFileFacts {
  // Stamped before the read: a file that changes mid-read is read again next time.
  const stamp = libraryFileStamp(path);
  const hit = cache.get(path);

  if (stamp != null && hit?.stamp === stamp) {
    return hit.facts;
  }

  cache.delete(path);

  const bytes = readLibraryBytes(path);
  const facts: DeviceFileFacts = {
    header: Buffer.from(bytes.subarray(0, HEADER_BYTES)),
    version: readDeviceVersion(bytes),
    digest: createHash("sha256").update(bytes).digest("hex"),
  };

  if (stamp != null) {
    cache.set(path, { stamp, facts });
  }

  return facts;
}

/**
 * Drop what is remembered about a file this process just wrote.
 * @param path - The device file
 */
export function forgetDeviceFile(path: string): void {
  cache.delete(path);
}

/** Drop everything remembered. For test setup only. */
export function forgetAllDeviceFiles(): void {
  cache.clear();
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A frozen device is uncompressed and carries the server's source, which
// holds this line.
const VERSION_MARKER = Buffer.from('const VERSION = "');
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[\dA-Za-z.-]+)?$/;
const MAX_VERSION_LENGTH = 32;

/**
 * Find the version a frozen device was built from.
 *
 * @param bytes - Contents of an .amxd file
 * @returns The version, or undefined when the file doesn't name one
 */
export function readDeviceVersion(bytes: Buffer): string | undefined {
  let at = bytes.indexOf(VERSION_MARKER);

  while (at !== -1) {
    const start = at + VERSION_MARKER.length;
    const end = bytes.indexOf('"', start);

    if (end !== -1 && end - start <= MAX_VERSION_LENGTH) {
      const version = bytes.toString("latin1", start, end);

      if (VERSION_PATTERN.test(version)) {
        return version;
      }
    }

    at = bytes.indexOf(VERSION_MARKER, start);
  }

  return undefined;
}

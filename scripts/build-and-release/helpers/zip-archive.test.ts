// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { platformSupport } from "#src/test/fixtures/platform-support.ts";
import { zipFolders } from "./zip-archive.ts";

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "ppal-zip-"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/**
 * @param file - File to write, relative to the scratch src folder
 * @param content - What to write
 */
function write(file: string, content: string | Buffer): void {
  const full = join(scratch, "src", file);

  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

/**
 * Read a zip back through its central directory, the way unzip tools do.
 *
 * @param zipFile - Zip to read
 * @returns Each entry's name and contents, in zip order
 */
function readZip(zipFile: string): Map<string, Buffer> {
  const zip = readFileSync(zipFile);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const entries = new Map<string, Buffer>();
  let pos = zip.readUInt32LE(end + 16);

  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const size = zip.readUInt32LE(pos + 20);
    const nameLength = zip.readUInt16LE(pos + 28);
    const local = zip.readUInt32LE(pos + 42);
    const start =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);

    entries.set(
      zip.toString("utf8", pos + 46, pos + 46 + nameLength),
      zip.readUInt16LE(pos + 10) === 8 ? inflateRawSync(raw) : raw,
    );
    pos += 46 + nameLength + zip.readUInt16LE(pos + 30);
  }

  return entries;
}

describe("zipFolders", () => {
  it("zips nested folders at the zip root, skipping named files", () => {
    const binary = Buffer.from([0, 1, 2, 255, 254]);

    write("alpha/SKILL.md", "# Alpha\n".repeat(200));
    write("alpha/scripts/run.mjs", "console.log('ünïcode');\n");
    write("alpha/.DS_Store", "junk");
    write("beta/data.bin", binary);
    write("gamma/left-out.md", "not zipped");

    const zip = join(scratch, "out.zip");

    zipFolders(zip, join(scratch, "src"), ["alpha", "beta"], [".DS_Store"]);

    const entries = readZip(zip);

    expect([...entries.keys()]).toStrictEqual([
      "alpha/",
      "alpha/scripts/",
      "alpha/scripts/run.mjs",
      "alpha/SKILL.md",
      "beta/",
      "beta/data.bin",
    ]);
    expect(entries.get("alpha/SKILL.md")?.toString()).toBe(
      "# Alpha\n".repeat(200),
    );
    expect(entries.get("alpha/scripts/run.mjs")?.toString()).toBe(
      "console.log('ünïcode');\n",
    );
    expect(entries.get("beta/data.bin")).toStrictEqual(binary);
  });

  it.skipIf(!platformSupport.symlinks)(
    "zips the contents of a symlinked folder",
    () => {
      write("shared/notes.md", "shared");
      write("alpha/SKILL.md", "# Alpha");
      symlinkSync(join(scratch, "src/shared"), join(scratch, "src/alpha/link"));

      const zip = join(scratch, "out.zip");

      zipFolders(zip, join(scratch, "src"), ["alpha"]);

      expect(readZip(zip).get("alpha/link/notes.md")?.toString()).toBe(
        "shared",
      );
    },
  );
});

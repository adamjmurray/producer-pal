// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { deviceFilePath } from "#src/portal/setup/device-file-status.ts";
import { recordDeviceSource, resetDeviceSource } from "../device-source.ts";

/**
 * Bytes shaped like a frozen device: Max's container header, `mx@c` where a
 * frozen patcher body starts, then the server source.
 *
 * @param version - Version to stamp in, or none for a file with no marker
 * @param tag - Extra text so two files with one version still differ
 * @returns The fake device's contents
 */
export function frozenDevice(version?: string, tag = ""): Buffer {
  const marker = version == null ? "" : `const VERSION = "${version}";`;

  return Buffer.concat([
    Buffer.alloc(32, "a"),
    Buffer.from(`mx@c\u0000${marker}\u0000${tag}`, "latin1"),
  ]);
}

/**
 * Bytes shaped like a development device: JSON that points at sibling files.
 *
 * @returns The fake device's contents
 */
export function developmentDevice(): Buffer {
  return Buffer.from(
    `ampf\u0004\u0000\u0000\u0000mmmmmeta\u0004\u0000\u0000\u0000\u0001\u0000\u0000\u0000ptch\u0000\u0000\u0000\u0000{"patcher":{}}`,
    "latin1",
  );
}

/** Scratch folders for one test: a User Library and a Downloads folder. */
export interface DeviceScratch {
  library: string;
  downloads: string;
  /** Where the installed copy lives in `library`. */
  installed: string;
  /** Write a device into Downloads and report it as the running device. */
  runFromDownloads: (bytes: Buffer) => string;
  /** Write a file, making its folders. */
  put: (file: string, bytes: Buffer | string) => void;
}

/**
 * Make a fresh User Library and Downloads folder for each test, forget the
 * running device, and remove the folders afterward.
 *
 * @returns A getter for the current test's folders
 */
export function useDeviceScratch(): () => DeviceScratch {
  let scratch: DeviceScratch;
  let root = "";

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ppal-device-install-"));
    const library = join(root, "User Library");
    const downloads = join(root, "Downloads");

    mkdirSync(library);
    mkdirSync(downloads);
    resetDeviceSource();
    scratch = {
      library,
      downloads,
      installed: deviceFilePath(library),
      runFromDownloads: (bytes) => {
        const file = join(downloads, "Producer_Pal.amxd");

        writeFileSync(file, bytes);
        recordDeviceSource(file);

        return file;
      },
      put: (file, bytes) => {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, bytes);
      },
    };
  });

  afterEach(() => {
    resetDeviceSource();
    rmSync(root, { recursive: true, force: true });
  });

  return () => scratch;
}

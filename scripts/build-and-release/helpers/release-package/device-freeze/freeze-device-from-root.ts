// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DEV_BUILD_OVERRIDE } from "../../build-flag-guard.ts";
import { checkNotDevBuild, FROZEN_DEVICE_FILENAME } from "../frozen-device.ts";
import {
  AMXD_META_FROZEN,
  AMXD_META_UNFROZEN,
  buildAmxd,
  parseAmxd,
} from "./amxd-container.ts";
import { listDeviceFiles } from "./device-file-list.ts";
import { buildFrozenBody, type FrozenEntry } from "./frozen-body.ts";

/** Where the unfrozen device and the files it uses live, under the repo root. */
export const DEVICE_DIR_NAME = "max-for-live-device";

/** Flag Max sets on the main patcher and on the file a `node.script` runs. */
const FLAG_MAIN_PATCHER = 0x11;
const FLAG_NODE_SCRIPT = 0x08;

/** Seconds between the Mac epoch (1904-01-01) and the Unix epoch. */
const MAC_EPOCH_OFFSET_SECONDS = 2_082_844_800;

export interface FrozenDevice {
  /** The finished .amxd. */
  bytes: Buffer;
  /** The frozen files in order, with sizes. */
  files: { name: string; size: number }[];
  warnings: string[];
}

/**
 * Freeze the unfrozen device under a repo root, as Max's Freeze button does.
 *
 * @param rootDir - The repo root (holds `max-for-live-device/`)
 * @param options - Freeze options
 * @param options.allowDevBuild - Freeze bundles built with dev-only flags anyway, with a warning
 * @returns The frozen device, the files in it, and any warnings
 */
export function freezeDeviceFromRoot(
  rootDir: string,
  options: { allowDevBuild?: boolean } = {},
): FrozenDevice {
  const deviceDir = join(rootDir, DEVICE_DIR_NAME);
  const devicePath = join(deviceDir, FROZEN_DEVICE_FILENAME);
  const { meta, body } = parseAmxd(readFileSync(devicePath));

  if (meta !== AMXD_META_UNFROZEN) {
    throw new Error(`${devicePath} is already frozen.`);
  }

  const json = JSON.parse(body.toString("utf8").replace(/\0+$/, "")) as {
    patcher: Parameters<typeof listDeviceFiles>[1];
  };
  const { files, warnings } = listDeviceFiles(deviceDir, json.patcher);

  const entries: FrozenEntry[] = [
    {
      name: FROZEN_DEVICE_FILENAME,
      type: "JSON",
      data: body,
      flag: FLAG_MAIN_PATCHER,
      mdat: macTime(devicePath),
    },
    ...files.map((file) => ({
      name: file.name,
      type: fileType(file.name),
      data: readFileSync(file.path),
      flag: file.nodeScript ? FLAG_NODE_SCRIPT : 0,
      mdat: macTime(file.path),
    })),
  ];

  // The editable device never carries the marker; the bundles it uses might.
  for (const entry of entries) {
    const devBuild = checkNotDevBuild(entry.name, entry.data);

    if (devBuild == null) {
      continue;
    }

    if (options.allowDevBuild !== true) {
      throw new Error(
        `${devBuild}\nRebuild clean and freeze with \`npm run release:amxd\`, or to test it in Live: ${DEV_BUILD_OVERRIDE}=true npm run device:freeze`,
      );
    }

    warnings.push(devBuild);
  }

  return {
    bytes: buildAmxd(AMXD_META_FROZEN, buildFrozenBody(entries)),
    files: entries.map((e) => ({ name: e.name, size: e.data.length })),
    warnings,
  };
}

// A file's modified time as Max stores it.
function macTime(path: string): number {
  return Math.floor(statSync(path).mtimeMs / 1000) + MAC_EPOCH_OFFSET_SECONDS;
}

// The four-character type Max records for a file.
function fileType(name: string): string {
  if (name.endsWith(".maxpat") || name.endsWith(".amxd")) {
    return "JSON";
  }

  return name.endsWith(".svg") ? "svg " : "TEXT";
}

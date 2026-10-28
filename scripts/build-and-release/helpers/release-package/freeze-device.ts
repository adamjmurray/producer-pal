#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Freezes the Max for Live device without opening Max. Writes the same bytes
// Max's Freeze button does, from max-for-live-device/Producer_Pal.amxd and the
// files it uses. Run after a build.
//
//   npm run device:freeze [-- --out <path>]    (default release/Producer_Pal.amxd)
//
// Refuses bundles built with dev-only flags (npm run build:debug). To freeze one
// for testing in Live, set ALLOW_DEV_BUILD_FLAGS=true; it can't ship.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEV_BUILD_OVERRIDE } from "../build-flag-guard.ts";
import { freezeDeviceFromRoot } from "./device-freeze/freeze-device-from-root.ts";
import { FROZEN_DEVICE_FILENAME } from "./frozen-device.ts";
import { errorMessage } from "#src/shared/error-message.ts";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const outIndex = process.argv.indexOf("--out");
const outArg = outIndex === -1 ? undefined : process.argv[outIndex + 1];
const outPath =
  outArg == null
    ? join(rootDir, "release", FROZEN_DEVICE_FILENAME)
    : resolve(outArg);

try {
  if (outIndex !== -1 && outArg == null) {
    throw new Error("--out needs a path.");
  }

  const { bytes, files, warnings } = freezeDeviceFromRoot(rootDir, {
    allowDevBuild: process.env[DEV_BUILD_OVERRIDE] === "true",
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, bytes);

  for (const warning of warnings) {
    console.warn(`WARNING: ${warning}`);
  }

  console.log(`Froze ${files.length} files into ${outPath}:`);

  for (const { name, size } of files) {
    console.log(`  ${name} (${size} bytes)`);
  }
} catch (error) {
  console.error(`\n❌ ${errorMessage(error)}`);
  process.exit(1);
}

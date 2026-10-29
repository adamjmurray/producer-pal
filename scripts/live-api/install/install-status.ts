#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Show what Producer Pal files are in the Ableton User Library: the device, any
 * other Producer_Pal .amxd copies, and the remote script. Changes nothing.
 *
 * Usage: npm run install:status
 */

import { join } from "node:path";
import { installStatusLines } from "./helpers/install-status-report.ts";
import { resolveInstallLibraryOrExit } from "./helpers/install-library.ts";
import { releaseDevicePath } from "./helpers/release-device.ts";

const rootDir = join(import.meta.dirname, "../../..");
const library = await resolveInstallLibraryOrExit();

for (const line of installStatusLines(
  library.path,
  releaseDevicePath(rootDir),
)) {
  console.log(line);
}

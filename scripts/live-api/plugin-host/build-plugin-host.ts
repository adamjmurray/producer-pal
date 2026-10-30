#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Rebuild both plug-in host devices in max-for-live-device/plugin-host/ in
 * place from wrapper.js beside them.
 *
 * Usage: npm run plugin-host:build [-- --extract]
 *   --extract  first copy the Effect device's code into wrapper.js, to keep an
 *              edit made in Max's code box
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPluginHostDevice,
  extractWrapperCode,
} from "./plugin-host-device.ts";

const dir = join(
  import.meta.dirname,
  "../../../max-for-live-device/plugin-host",
);
const devices = ["PPal Plug-in Effect.amxd", "PPal Plug-in Instrument.amxd"];
const wrapperPath = join(dir, "wrapper.js");

if (process.argv.includes("--extract")) {
  const effect = readFileSync(join(dir, "PPal Plug-in Effect.amxd"));

  writeFileSync(wrapperPath, extractWrapperCode(effect));
  console.log(`extracted ${wrapperPath}`);
}

const code = readFileSync(wrapperPath, "utf8");

for (const device of devices) {
  const path = join(dir, device);
  const built = buildPluginHostDevice(readFileSync(path), code);

  writeFileSync(path, built);
  console.log(`${device} ${built.length}`);
}

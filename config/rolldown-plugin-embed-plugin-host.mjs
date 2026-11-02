// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Inlines the plug-in host wrapper devices into the Node bundles, so the device
// and the portal can install them with no repo to read from.
//
// It replaces src/portal/setup/plugin-host/embedded-plugin-host-wrappers.ts,
// whose checked-in body reads the same files off disk for tests and the dev
// installer. Hosting is behind ENABLE_HOSTED_PLUGINS, so without it the plugin
// embeds nothing and a release build carries no wrapper bytes.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(rootDir, "max-for-live-device/plugin-host");
const embeddedModule = join(
  rootDir,
  "src/portal/setup/plugin-host/embedded-plugin-host-wrappers.ts",
);

/**
 * Build the wrapper embedding plugin.
 *
 * @returns A rolldown plugin
 */
export function embedPluginHost() {
  return {
    name: "embed-plugin-host",
    buildStart() {
      if (!existsSync(embeddedModule)) {
        throw new Error(
          `embed-plugin-host: ${embeddedModule} no longer exists. Update ` +
            "config/rolldown-plugin-embed-plugin-host.mjs to match the rename.",
        );
      }

      for (const name of Object.keys(shippedWrappers())) {
        this.addWatchFile(join(sourceDir, name));
      }
    },
    load(id) {
      if (id !== embeddedModule) {
        return;
      }

      return `export const EMBEDDED_PLUGIN_HOST_WRAPPERS = ${JSON.stringify(shippedWrappers(), null, 2)};\n`;
    },
  };
}

/**
 * The wrappers this build embeds: all of them with the flag, else none.
 *
 * @returns File name to base64 bytes
 */
function shippedWrappers() {
  return process.env.ENABLE_HOSTED_PLUGINS === "true"
    ? readWrapperSource(sourceDir)
    : {};
}

/**
 * Read the wrapper devices out of a folder.
 *
 * @param dir - Folder holding the .amxd files
 * @returns File name to base64 bytes, .amxd files only
 */
export function readWrapperSource(dir) {
  const files = {};

  for (const name of readdirSync(dir)) {
    if (name.endsWith(".amxd") && !name.startsWith(".")) {
      files[name] = readFileSync(join(dir, name)).toString("base64");
    }
  }

  return files;
}

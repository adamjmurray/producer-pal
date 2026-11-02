// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { join } from "node:path";
import {
  pluginHostSourceDir,
  readPluginHostSource,
} from "./plugin-host-source.ts";
import { type PluginHostSource } from "./plugin-host-wrappers.ts";

// The device is a frozen .amxd with no repo to read, so
// config/rolldown-plugin-embed-plugin-host.mjs REPLACES this whole module at
// bundle time with the same map written out as a literal. Nothing below ships.
// Plug-in hosting is behind ENABLE_HOSTED_PLUGINS, and the plugin embeds
// nothing without it, as this module does. Renaming this file without
// updating that plugin fails the build.
const ROOT_DIR = join(import.meta.dirname, "../../../..");

/** The wrapper devices as base64, or nothing without ENABLE_HOSTED_PLUGINS. */
export const EMBEDDED_PLUGIN_HOST_WRAPPERS: PluginHostSource =
  process.env.ENABLE_HOSTED_PLUGINS === "true"
    ? readPluginHostSource(pluginHostSourceDir(ROOT_DIR))
    : {};

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { join } from "node:path";
import { readRemoteScriptSource } from "./remote-script-source.ts";

// The device is a frozen .amxd with no repo to read, so
// config/rolldown-plugin-embed-remote-script.mjs REPLACES this whole module at
// bundle time with the same map written out as literals, and rewrites
// version.py's version to package.json's. Nothing below ships. Renaming this
// file without updating that plugin fails the build.
const SOURCE_DIR = join(
  import.meta.dirname,
  "../../../../remote-script/Producer_Pal",
);

/** The remote script's Python sources, keyed by path relative to its folder. */
export const EMBEDDED_REMOTE_SCRIPT_FILES: Record<string, string> =
  readRemoteScriptSource(SOURCE_DIR);

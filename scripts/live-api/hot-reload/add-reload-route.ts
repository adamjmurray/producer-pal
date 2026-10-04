// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appendToRoutes } from "../python-probe/add-probe-route.ts";

const REGISTRATION_SOURCE = join(import.meta.dirname, "reload-registration.py");

/**
 * Add the dev-only /reload route to an installed copy of the remote script.
 * Like /probe, it only ever goes into the installed copy: the repo's remote
 * script and the device bundle never register it.
 *
 * The registration is the Python file's text below its license header (the
 * first blank line), so a test can run the same text.
 *
 * @param installPath - The installed Producer_Pal folder
 */
export function addReloadRoute(installPath: string): void {
  const source = readFileSync(REGISTRATION_SOURCE, "utf8");

  appendToRoutes(
    installPath,
    `\n${source.split("\n\n").slice(1).join("\n\n")}`,
  );
}

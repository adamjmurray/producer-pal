// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { appendFileSync, copyFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PROBE_SOURCE = join(import.meta.dirname, "probe.py");

const REGISTRATION = `
# Dev-only, added by \`npm run remote-script:install -- --probe\`.
from .probe import probe as _probe  # noqa: E402
ROUTES["/probe"] = _probe
POST_ONLY = POST_ONLY + ("/probe",)
`;

/**
 * Add the dev-only /probe route to an installed copy of the remote script.
 * Only ever touches the installed copy: the repo's remote script and the
 * device bundle never contain it.
 *
 * @param installPath - The installed Producer_Pal folder
 */
export function addProbeRoute(installPath: string): void {
  // Copied first: the registration imports it, so Live would fail to load
  // the script if it were missing.
  copyFileSync(PROBE_SOURCE, join(installPath, "probe.py"));
  appendToRoutes(installPath, REGISTRATION);
}

/**
 * Append Python to an installed routes.py, where it can add to ROUTES and
 * POST_ONLY.
 *
 * @param installPath - The installed Producer_Pal folder
 * @param registration - The Python to append
 * @throws Error when routes.py no longer defines ROUTES and POST_ONLY
 */
export function appendToRoutes(
  installPath: string,
  registration: string,
): void {
  const routesPath = join(installPath, "routes.py");
  const routes = readFileSync(routesPath, "utf8");

  // The registration appends to these, so fail loudly if they're renamed.
  if (!/^ROUTES = \{/m.test(routes) || !/^POST_ONLY = /m.test(routes)) {
    throw new Error(`${routesPath} no longer defines ROUTES and POST_ONLY`);
  }

  appendFileSync(routesPath, registration);
}

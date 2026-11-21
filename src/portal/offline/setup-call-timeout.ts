// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { canonicalManageAction } from "#src/tools/core/helpers/manage-contract.ts";
import { offlineError } from "./offline-responses.ts";

/**
 * The answer when the device took the setup budget without answering a setup
 * call the bridge forwarded. Only a request that was sent may have run.
 * @param args - The ppal-manage arguments
 * @param sent - Whether the request left for the device
 * @returns The error response
 */
export function forwardedSetupTimeout(
  args: Record<string, unknown>,
  sent: boolean,
): McpResponse {
  const installing =
    canonicalManageAction(args.action) === "install-producer-pal";
  const what = installing ? "install" : "request";

  if (!sent) {
    return offlineError(
      `${installing ? "nothing was installed" : "nothing was changed"}: ran out of time before the ${what} was sent to Producer Pal. Call it again.`,
    );
  }

  return offlineError(
    `the ${what} did not answer in time, so it may or may not have finished. ` +
      (installing
        ? "Run it again: an install replaces the old copy whole"
        : "Call ppal-connect to check before trying again"),
  );
}

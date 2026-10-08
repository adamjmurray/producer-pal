// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { UPDATE_PORTAL_ADVICE, VERSION } from "#src/shared/config.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "./connect-append.ts";

/**
 * Wrap a callLiveApi so a successful ppal-connect response says which portal it
 * came through, and flags a portal/device version mismatch. The portal and the
 * device are updated separately, so they drift.
 *
 * Done Node-side because V8 can't see HTTP headers. A request with no portal
 * (chat UI, direct HTTP client) gets nothing.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getPortalVersion - Reads this request's portal version, if it has one
 * @returns A callLiveApi that appends the portal version line to connect results
 */
export function withPortalVersion(
  inner: CallLiveApiFunction,
  getPortalVersion: () => string | undefined,
): WrappedCallLiveApi {
  return withConnectAppend(inner, () => portalVersionLine(getPortalVersion()));
}

/**
 * The one-line connect block for a portal version.
 *
 * @param portalVersion - The portal's version, or undefined when none connected
 * @returns The line, or null when the request did not come through a portal
 */
function portalVersionLine(portalVersion: string | undefined): string | null {
  if (portalVersion == null) {
    return null;
  }

  const line = `portalVersion: ${portalVersion}`;

  if (isNewerVersion(portalVersion, VERSION)) {
    return `${line}. The portal is older than the device (${VERSION}). ${UPDATE_PORTAL_ADVICE}`;
  }

  if (isNewerVersion(VERSION, portalVersion)) {
    return `${line}. The device is older than the portal. Tell the user to update the Producer Pal device (${VERSION}).`;
  }

  return line;
}

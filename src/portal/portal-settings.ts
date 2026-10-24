// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  DISABLED_TOOLS_HEADER,
  FORMAT_HEADER,
  LIVE_API_HEADER,
  PORTAL_VERSION_HEADER,
  SMALL_MODEL_MODE_HEADER,
  VERSION,
} from "#src/shared/config.ts";
import { NOTATION_HEADER, type Notation } from "#src/shared/notation.ts";

/**
 * The portal's per-client settings. Every one of them travels as a request
 * header, never as a POST /config push: those write device-wide state, so one
 * portal's flags would reach the chat UI and every other connected client (and
 * visibly flip the device's Setup-tab toggles), with nothing to restore them
 * when this process exits.
 */
export interface BridgeOptions {
  smallModelMode?: boolean;
  notation?: Notation;
  jsonOutput?: boolean;
  liveApiEnabled?: boolean;
  /** Tools to withhold from THIS client. */
  disabledTools?: string[];
}

/**
 * Turn the portal's settings into the headers every request carries.
 *
 * The portal's own version always rides along, so the device can flag a
 * portal/device version mismatch in the ppal-connect result.
 *
 * Each is tri-state: a header is sent only when the option was set (true OR
 * false), so an unset option leaves the device's own setting alone while an
 * explicit false can turn a setting off for this client.
 *
 * @param options - The portal's resolved options
 * @returns The headers
 */
export function buildRequestHeaders(
  options: BridgeOptions,
): Record<string, string> {
  const headers: Record<string, string> = { [PORTAL_VERSION_HEADER]: VERSION };

  if (options.smallModelMode != null) {
    headers[SMALL_MODEL_MODE_HEADER] = String(options.smallModelMode);
  }

  if (options.notation) {
    headers[NOTATION_HEADER] = options.notation;
  }

  if (options.jsonOutput != null) {
    headers[FORMAT_HEADER] = options.jsonOutput ? "json" : "compact";
  }

  if (options.liveApiEnabled != null) {
    headers[LIVE_API_HEADER] = String(options.liveApiEnabled);
  }

  if (options.disabledTools?.length) {
    headers[DISABLED_TOOLS_HEADER] = options.disabledTools.join(",");
  }

  return headers;
}

/**
 * The `requestInit` a StreamableHTTPClientTransport wants for these settings.
 *
 * @param options - The portal's resolved options
 * @returns Transport options carrying the headers
 */
export function requestHeaderTransportOptions(options: BridgeOptions): {
  requestInit: { headers: Record<string, string> };
} {
  return { requestInit: { headers: buildRequestHeaders(options) } };
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  DISABLED_TOOLS_HEADER,
  FORMAT_HEADER,
  LIVE_API_HEADER,
  PORTAL_VERSION_HEADER,
  SMALL_MODEL_MODE_CAPABILITY,
  SMALL_MODEL_MODE_HEADER,
  VERSION,
} from "#src/shared/config.ts";
import { NOTATION_HEADER, type Notation } from "#src/shared/notation.ts";

const CONFIG_TIMEOUT_MS = 2000;
// The first streamable-HTTP revision. A device that doesn't speak it answers
// with the one it does, and the setting is in either reply.
const INITIALIZE_PROTOCOL_VERSION = "2025-03-26";

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

/**
 * Whether small-model mode is on for this portal's calls. The portal's own
 * setting wins; otherwise the device's (Chat UI toggle). Never throws: when the
 * device can't say, the answer is false.
 * @param portalSetting - The portal's small-model setting, if it has one
 * @param mcpUrl - The device's MCP URL
 * @param timeoutMs - How long each read of the device may take
 * @returns True when small-model mode is on
 */
export async function callerSmallModelMode(
  portalSetting: boolean | undefined,
  mcpUrl: string,
  timeoutMs = CONFIG_TIMEOUT_MS,
): Promise<boolean> {
  if (portalSetting != null) {
    return portalSetting;
  }

  try {
    return (
      (await smallModelModeFromInitialize(mcpUrl, timeoutMs)) ??
      (await smallModelModeFromConfig(mcpUrl, timeoutMs))
    );
  } catch {
    return false;
  }
}

/**
 * The device's setting off a fresh `initialize` POST. /mcp is the one route the
 * DNS-rebinding guard lets through on any Host, so this works behind a custom
 * tunnel domain where GET /config is refused. Plain fetch rather than a second
 * SDK client: the device is stateless, and a throwaway client would run the
 * bridge's connect bookkeeping twice. Fresh, not read off the bridge's
 * long-lived client, so a Chat UI toggle made since connecting counts.
 * @param mcpUrl - The device's MCP URL
 * @param timeoutMs - How long the POST may take
 * @returns The setting, or undefined when the device doesn't report it or the
 *   reply can't be read (the caller then asks GET /config)
 */
async function smallModelModeFromInitialize(
  mcpUrl: string,
  timeoutMs: number,
): Promise<boolean | undefined> {
  try {
    return await postInitialize(mcpUrl, timeoutMs);
  } catch {
    return undefined;
  }
}

async function postInitialize(
  mcpUrl: string,
  timeoutMs: number,
): Promise<boolean | undefined> {
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: INITIALIZE_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "producer-pal-portal", version: VERSION },
      },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  // The reply is a JSON body or a one-event SSE stream.
  const json = text.startsWith("{")
    ? text
    : text.split("\n").find((line) => line.startsWith("data:"));
  const message = JSON.parse(json?.replace(/^data:/, "") ?? "") as {
    result?: { capabilities?: { experimental?: Record<string, unknown> } };
  };
  const reported = message.result?.capabilities?.experimental?.[
    SMALL_MODEL_MODE_CAPABILITY
  ] as { smallModelMode?: unknown } | undefined;

  return typeof reported?.smallModelMode === "boolean"
    ? reported.smallModelMode
    : undefined;
}

/**
 * The setting off GET /config, for a device too old to report it in its
 * handshake. Refused on a Host the DNS-rebinding guard doesn't trust.
 * @param mcpUrl - The device's MCP URL
 * @param timeoutMs - How long the GET may take
 * @returns The setting
 */
async function smallModelModeFromConfig(
  mcpUrl: string,
  timeoutMs: number,
): Promise<boolean> {
  const response = await fetch(new URL("/config", mcpUrl), {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const config = (await response.json()) as { smallModelMode?: unknown };

  return config.smallModelMode === true;
}

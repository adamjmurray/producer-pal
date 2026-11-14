// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Where a tool call lands when the device doesn't answer, and whether the
// device is on this computer.

import { isLoopbackHost } from "#src/shared/config.ts";
import { canonicalManageAction } from "#src/tools/core/helpers/manage-contract.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { type OfflineDeps } from "./offline-deps.ts";
import { offlineGuidance, remoteGuidance } from "./offline-guidance.ts";
import { offlineManage } from "./offline-manage.ts";
import { remoteSetupRefusal } from "./offline-responses.ts";

export const MANAGE_TOOL = "ppal-manage";

export interface OfflineCall {
  name: string;
  args: Record<string, unknown>;
  /** Whether this portal lists ppal-manage (small-model mode and `--disable-tools` drop it) */
  manageOffered: boolean;
  /** Connect to the device's server; throws until it answers or `timeoutMs` passes */
  connect: (timeoutMs?: number) => Promise<void>;
  /** When a setup call must be done, as a `now()` time; it started at arrival */
  deadline?: number;
  /** The device's `host[:port]` when it is on another computer; see `remoteHost` */
  remoteHost?: string | null;
}

/**
 * Answer a call the device didn't: ppal-manage does what it can on its own,
 * and anything else is told how to get Producer Pal running. A device on
 * another computer gets neither: nothing here looks at this machine.
 * @param call - The tool call and what this portal offers
 * @param deps - What the answers reach out to
 * @returns The response
 */
export async function answerOfflineCall(
  call: OfflineCall,
  deps: OfflineDeps,
): Promise<McpResponse> {
  if (call.remoteHost != null) {
    return isSetupCall(call.name, call.args, call.manageOffered)
      ? remoteSetupRefusal(call.remoteHost, call.args.action)
      : remoteGuidance(call.remoteHost);
  }

  if (call.name === MANAGE_TOOL && call.manageOffered) {
    const answer = await offlineManage(
      call.args,
      call.connect,
      deps,
      call.deadline,
    );

    if (answer != null) {
      return answer;
    }
  }

  return await offlineGuidance(call.manageOffered, deps);
}

/**
 * Whether a tool call installs, adds or updates the device. These must finish
 * inside the setup budget, counted from when the call arrives.
 * @param name - The tool called
 * @param args - Its arguments
 * @param manageOffered - Whether this portal lists ppal-manage
 * @returns True for those ppal-manage actions when it is offered
 */
export function isSetupCall(
  name: string,
  args: Record<string, unknown>,
  manageOffered: boolean,
): boolean {
  const action = canonicalManageAction(args.action);

  return (
    manageOffered &&
    name === MANAGE_TOOL &&
    (action === "install-producer-pal" ||
      action === "add-producer-pal" ||
      action === "update-producer-pal")
  );
}

// Node writes an IPv4-mapped address as two hex groups: ::ffff:7f00:1
const MAPPED_IPV4 = /^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/;

/**
 * Whether the device is on another computer. The portal's own answers (the
 * remote script ping, the User Library lookups, the install and update copies)
 * all act on this machine, so they must not run for a device elsewhere.
 *
 * The server's DNS-rebinding guard shares `isLoopbackHost` and is strict on
 * purpose. The portal reads a URL the user typed, so it also accepts the
 * spellings of this machine that guard has no reason to: a trailing dot,
 * 0.0.0.0, `[::]` and IPv4-mapped IPv6.
 * @param httpUrl - The device's MCP URL the portal was given
 * @returns The `host[:port]` when it isn't this machine, else null (this
 *   machine, or a URL the bridge refuses before it gets here, see
 *   `isHttpUrl`). This machine's own LAN address counts as another computer.
 */
export function remoteHost(httpUrl: string): string | null {
  const url = parseHttpUrl(httpUrl);

  return url == null || isThisMachine(url) ? null : url.host;
}

/**
 * Whether the URL is one the portal can reach a device at: it parses and its
 * protocol is http or https. `localhost:3350/mcp` parses, as protocol
 * `localhost:` with no host, so parsing alone isn't enough.
 * @param httpUrl - The device's MCP URL the portal was given
 * @returns True for an http(s) URL
 */
export function isHttpUrl(httpUrl: string): boolean {
  return parseHttpUrl(httpUrl) != null;
}

function parseHttpUrl(httpUrl: string): URL | null {
  try {
    const url = new URL(httpUrl);

    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isThisMachine(url: URL): boolean {
  // `hostname` is lowercased, with IPv4 spellings (127.1, 0x7f.1) already
  // written as dotted quads.
  const name = url.hostname.replace(/\.$/, "");
  const port = url.port === "" ? "" : `:${url.port}`;

  return (
    isLoopbackHost(`${name}${port}`) ||
    name === "0.0.0.0" ||
    name === "[::]" ||
    isMappedThisMachine(name)
  );
}

function isMappedThisMachine(name: string): boolean {
  const groups = MAPPED_IPV4.exec(name);

  if (groups == null) {
    return false;
  }

  const high = Number.parseInt(groups[1] as string, 16);
  const low = Number.parseInt(groups[2] as string, 16);

  return high >> 8 === 127 || (high === 0 && low === 0);
}

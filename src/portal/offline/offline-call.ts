// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Where a tool call lands when the device doesn't answer.

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
 * Whether the device is on another computer. The portal's own answers (the
 * remote script ping, the User Library lookups, the install and update copies)
 * all act on this machine, so they must not run for a device elsewhere.
 * @param httpUrl - The device's MCP URL the portal was given
 * @returns The `host[:port]` when it isn't loopback, else null (this machine,
 *   or a URL with no host, which the bridge reports itself). This machine's own
 *   LAN address counts as another computer.
 */
export function remoteHost(httpUrl: string): string | null {
  try {
    const { host } = new URL(httpUrl);

    return host === "" || isLoopbackHost(host) ? null : host;
  } catch {
    return null;
  }
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

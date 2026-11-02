// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Where a tool call lands when the device doesn't answer.

import { canonicalManageAction } from "#src/tools/core/helpers/manage-contract.ts";
import { type McpResponse } from "#src/shared/mcp-responses.ts";
import { type OfflineDeps } from "./offline-deps.ts";
import { offlineGuidance } from "./offline-guidance.ts";
import { offlineManage } from "./offline-manage.ts";

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
}

/**
 * Answer a call the device didn't: ppal-manage does what it can on its own,
 * and anything else is told how to get Producer Pal running.
 * @param call - The tool call and what this portal offers
 * @param deps - What the answers reach out to
 * @returns The response
 */
export async function answerOfflineCall(
  call: OfflineCall,
  deps: OfflineDeps,
): Promise<McpResponse> {
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
